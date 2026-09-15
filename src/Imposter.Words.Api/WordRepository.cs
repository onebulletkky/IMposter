using System.Security.Cryptography;
using Npgsql;

namespace Imposter.Words.Api;

public sealed class WordRepository(NpgsqlDataSource dataSource, TimeProvider clock) : IDisposable
{
    public static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(5);
    private readonly SemaphoreSlim refresh = new(1, 1);
    private Catalog? catalog;

    public async Task<WordPair?> GetRandomAsync(CancellationToken cancellationToken)
    {
        var snapshot = Volatile.Read(ref catalog);
        if (snapshot is null || clock.GetUtcNow() >= snapshot.ExpiresAt)
        {
            await refresh.WaitAsync(cancellationToken);
            try
            {
                snapshot = catalog;
                if (snapshot is null || clock.GetUtcNow() >= snapshot.ExpiresAt)
                {
                    // Cache the catalog, not one random response shared by every game.
                    await using var command = dataSource.CreateCommand("SELECT word, hint FROM word_pairs;");
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    var pairs = new List<WordPair>();
                    while (await reader.ReadAsync(cancellationToken))
                        pairs.Add(new WordPair(reader.GetString(0), reader.GetString(1)));
                    snapshot = new Catalog(pairs.ToArray(), clock.GetUtcNow().Add(CacheLifetime));
                    // An empty catalog should become usable as soon as words are added.
                    if (snapshot.Pairs.Length > 0) Volatile.Write(ref catalog, snapshot);
                }
            }
            finally { refresh.Release(); }
        }
        return snapshot.Pairs.Length == 0 ? null : snapshot.Pairs[RandomNumberGenerator.GetInt32(snapshot.Pairs.Length)];
    }

    // This database diagnostic is for startup/manual checks, not recurring probes.
    public async Task<bool> IsReadyAsync(CancellationToken cancellationToken)
    {
        await using var command = dataSource.CreateCommand("SELECT EXISTS (SELECT 1 FROM word_pairs);");
        return await command.ExecuteScalarAsync(cancellationToken) is true;
    }

    public void Dispose() => refresh.Dispose();

    private sealed record Catalog(WordPair[] Pairs, DateTimeOffset ExpiresAt);
}
