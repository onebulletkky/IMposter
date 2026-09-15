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

public sealed class GameStore(NpgsqlDataSource dataSource, TimeProvider clock)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

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
        await using var cmd = dataSource.CreateCommand("INSERT INTO lobbies (code, state) VALUES (@code, @state)");
        cmd.Parameters.AddWithValue("code", room.Code);
        cmd.Parameters.AddWithValue("state", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(room, Json));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    // The row lock serializes mutations across simultaneous requests and API instances.
    public async Task<T> WithRoom<T>(string code, Func<GameRoom, DateTimeOffset, Task<T>> action, CancellationToken ct)
    {
        code = NormalizeCode(code);
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await conn.BeginTransactionAsync(ct);
        await using var select = new NpgsqlCommand("SELECT state::text FROM lobbies WHERE code = @code AND expires_at > now() FOR UPDATE", conn, transaction);
        select.Parameters.AddWithValue("code", code);
        var json = await select.ExecuteScalarAsync(ct) as string
            ?? throw new ApiException(404, "Lobby not found. Check the code or create a new lobby.");
        var room = JsonSerializer.Deserialize<GameRoom>(json, Json) ?? throw new InvalidOperationException("Invalid stored lobby.");
        var now = clock.GetUtcNow();
        var previousVersion = room.Version;
        var result = await action(room, now);
        // Polling an unchanged room does not rewrite the JSON document. Refresh its
        // idle expiry at most every five minutes instead of on every request.
        if (room.Version == previousVersion && room.Players.Count > 0)
        {
            await using var touch = new NpgsqlCommand("UPDATE lobbies SET expires_at = now() + interval '24 hours' WHERE code = @code AND expires_at < now() + interval '23 hours 55 minutes'", conn, transaction);
            touch.Parameters.AddWithValue("code", code);
            await touch.ExecuteNonQueryAsync(ct);
            await transaction.CommitAsync(ct);
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
        return result;
    }

    public Task<T> WithRoom<T>(string code, Func<GameRoom, DateTimeOffset, T> action, CancellationToken ct)
        => WithRoom(code, (room, now) => Task.FromResult(action(room, now)), ct);

    public async Task<IReadOnlyList<string>> DueRooms(CancellationToken ct)
    {
        // Expired rooms are purged regardless of their phase.
        await using (var purge = dataSource.CreateCommand("DELETE FROM lobbies WHERE expires_at < now()"))
            await purge.ExecuteNonQueryAsync(ct);
        await using var cmd = dataSource.CreateCommand("""
            SELECT code FROM lobbies
            WHERE state ->> 'turnEndsAt' IS NOT NULL
              AND (state ->> 'turnEndsAt')::timestamptz <= now()
            LIMIT 100
            """);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var codes = new List<string>();
        while (await reader.ReadAsync(ct)) codes.Add(reader.GetString(0));
        return codes;
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
