using Imposter.Game.Domain;

namespace Imposter.Game.Api.Infrastructure;

// Store snapshots, never a mutable aggregate or a player's private view.
public sealed class RoomReadCache
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(2);
    private const int Capacity = 256;
    private readonly object gate = new();
    private readonly Dictionary<string, Entry> entries = new();
    private long generation;

    public long Generation { get { lock (gate) return generation; } }

    public string? Get(string code, DateTimeOffset now)
    {
        lock (gate)
        {
            if (!entries.TryGetValue(code, out var entry)) return null;
            if (now >= entry.ValidUntil || now >= entry.TurnEndsAt)
            {
                entries.Remove(code);
                return null;
            }
            return entry.Json;
        }
    }

    public void Store(GameRoom room, string json, DateTimeOffset readAt, DateTimeOffset lobbyExpiresAt, long observedGeneration)
    {
        lock (gate)
        {
            // A read started before a committed mutation cannot repopulate old data.
            if (observedGeneration != generation) return;
            if (entries.Count >= Capacity && !entries.ContainsKey(room.Code))
                entries.Remove(entries.Keys.First());
            var validUntil = readAt.Add(Lifetime);
            entries[room.Code] = new(json, validUntil < lobbyExpiresAt ? validUntil : lobbyExpiresAt, room.TurnEndsAt);
        }
    }

    public void Invalidate()
    {
        lock (gate)
        {
            generation++;
            entries.Clear();
        }
    }

    private sealed record Entry(string Json, DateTimeOffset ValidUntil, DateTimeOffset? TurnEndsAt);
}
