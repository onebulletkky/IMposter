using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Imposter.Game.Domain;
using Npgsql;
using NpgsqlTypes;

namespace Imposter.Game.Api.Infrastructure;

public sealed class ApiException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public sealed class GameStore(NpgsqlDataSource dataSource, TimeProvider clock, RoomReadCache cache) : IDisposable
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly SemaphoreSlim[] readGates = Enumerable.Range(0, 32).Select(_ => new SemaphoreSlim(1, 1)).ToArray();

    public async Task Initialize(CancellationToken ct)
    {
        await using var cmd = dataSource.CreateCommand("""
            CREATE TABLE IF NOT EXISTS lobbies (
                code varchar(5) PRIMARY KEY,
                state jsonb NOT NULL,
                updated_at timestamptz NOT NULL DEFAULT now(),
                expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
                CHECK (code ~ '^[A-Z0-9]{5}$')
            );
            CREATE INDEX IF NOT EXISTS ix_lobbies_expires_at ON lobbies (expires_at);
            """);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task Insert(GameRoom room, CancellationToken ct)
    {
        // Reclaim old codes on activity, without polling while everyone is away.
        await using (var purge = dataSource.CreateCommand("DELETE FROM lobbies WHERE expires_at <= now()"))
            await purge.ExecuteNonQueryAsync(ct);
        await using var cmd = dataSource.CreateCommand("INSERT INTO lobbies (code, state) VALUES (@code, @state)");
        cmd.Parameters.AddWithValue("code", room.Code);
        cmd.Parameters.AddWithValue("state", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(room, Json));
        await cmd.ExecuteNonQueryAsync(ct);
        cache.Invalidate();
    }

    // Mutations always use the row lock, including catch-up after a cold start.
    public async Task<T> WithRoom<T>(string code, Func<GameRoom, DateTimeOffset, Task<T>> action, CancellationToken ct, bool cacheRead = false)
    {
        code = NormalizeCode(code);
        if (!cacheRead) return await WithRoomCore(code, action, ct, false);
        // Coalesce simultaneous polling cache misses without an unbounded lock map.
        var gate = readGates[(uint)StringComparer.Ordinal.GetHashCode(code) % (uint)readGates.Length];
        await gate.WaitAsync(ct);
        try { return await WithRoomCore(code, action, ct, true); }
        finally { gate.Release(); }
    }

    private async Task<T> WithRoomCore<T>(string code, Func<GameRoom, DateTimeOffset, Task<T>> action, CancellationToken ct, bool cacheRead)
    {
        code = NormalizeCode(code);
        var now = clock.GetUtcNow();
        if (cacheRead && cache.Get(code, now) is { } cachedJson)
        {
            ct.ThrowIfCancellationRequested();
            var cachedRoom = JsonSerializer.Deserialize<GameRoom>(cachedJson, Json)
                ?? throw new InvalidOperationException("Invalid cached lobby.");
            return await action(cachedRoom, now);
        }
        var generation = cache.Generation;
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await conn.BeginTransactionAsync(ct);
        await using var select = new NpgsqlCommand("SELECT state::text, expires_at FROM lobbies WHERE code = @code AND expires_at > now() FOR UPDATE", conn, transaction);
        select.Parameters.AddWithValue("code", code);
        string json;
        DateTimeOffset expiresAt;
        await using (var reader = await select.ExecuteReaderAsync(ct))
        {
            if (!await reader.ReadAsync(ct))
                throw new ApiException(404, "Lobby not found. Check the code or create a new lobby.");
            json = reader.GetString(0);
            expiresAt = reader.GetFieldValue<DateTimeOffset>(1);
        }
        var room = JsonSerializer.Deserialize<GameRoom>(json, Json) ?? throw new InvalidOperationException("Invalid stored lobby.");
        now = clock.GetUtcNow();
        var previousVersion = room.Version;
        var result = await action(room, now);
        // Refresh idle expiry at most every five minutes, without rewriting JSON.
        if (room.Version == previousVersion && room.Players.Count > 0)
        {
            await using var touch = new NpgsqlCommand("UPDATE lobbies SET expires_at = now() + interval '24 hours' WHERE code = @code AND expires_at < now() + interval '23 hours 55 minutes'", conn, transaction);
            touch.Parameters.AddWithValue("code", code);
            await touch.ExecuteNonQueryAsync(ct);
            await transaction.CommitAsync(ct);
            if (cacheRead) cache.Store(room, json, now, expiresAt, generation);
            return result;
        }
        await using var save = new NpgsqlCommand(room.Players.Count == 0
            ? "DELETE FROM lobbies WHERE code = @code"
            : "UPDATE lobbies SET state = @state, updated_at = now(), expires_at = now() + interval '24 hours' WHERE code = @code", conn, transaction);
        save.Parameters.AddWithValue("code", code);
        if (room.Players.Count > 0)
            save.Parameters.AddWithValue("state", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(room, Json));
        await save.ExecuteNonQueryAsync(ct);
        await transaction.CommitAsync(ct);
        cache.Invalidate();
        return result;
    }

    public Task<T> WithRoom<T>(string code, Func<GameRoom, DateTimeOffset, T> action, CancellationToken ct)
        => WithRoom<T>(code, (room, now) => Task.FromResult(action(room, now)), ct, cacheRead: false);

    public void Dispose()
    {
        foreach (var gate in readGates) gate.Dispose();
    }

    public static string NormalizeCode(string? code)
    {
        code = code?.Trim().ToUpperInvariant();
        if (code is null || code.Length != 5 || code.Any(c => !char.IsAsciiLetterOrDigit(c)))
            throw new ApiException(400, "Enter a five-character lobby code using letters and numbers.");
        return code;
    }

    public static string NewCode() => string.Concat(Enumerable.Range(0, 5).Select(_ => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[RandomNumberGenerator.GetInt32(36)]));
    public static string NewToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    public static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public static Guid Authenticate(GameRoom room, string token)
    {
        if (token.Length != 64 || !token.All(char.IsAsciiHexDigit))
            throw new ApiException(401, "Your player session is invalid. Join the lobby again.");
        var hash = HashToken(token);
        var player = room.Players.FirstOrDefault(p => CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(p.TokenHash), Encoding.ASCII.GetBytes(hash)));
        return player?.Id ?? throw new ApiException(401, "Your player session is no longer in this lobby.");
    }
}
