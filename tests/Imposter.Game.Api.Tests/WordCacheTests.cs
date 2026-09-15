extern alias WordsApi;
using Npgsql;
using Xunit;
using WordRepository = WordsApi::Imposter.Words.Api.WordRepository;

namespace Imposter.Game.Api.Tests;

[Trait("Category", "Integration")]
public sealed class WordCacheTests : IAsyncLifetime
{
    private readonly string schema = "word_cache_test_" + Guid.NewGuid().ToString("N");
    private readonly TestClock clock = new();
    private string adminConnection = "";
    private NpgsqlDataSource database = null!;
    private WordRepository repository = null!;

    public async Task InitializeAsync()
    {
        adminConnection = Environment.GetEnvironmentVariable("TEST_GAMES_CONNECTION")
            ?? throw new InvalidOperationException("TEST_GAMES_CONNECTION is required.");
        await using var admin = new NpgsqlConnection(adminConnection);
        await admin.OpenAsync();
        await using var create = new NpgsqlCommand($"CREATE SCHEMA {schema}", admin);
        await create.ExecuteNonQueryAsync();
        database = NpgsqlDataSource.Create(new NpgsqlConnectionStringBuilder(adminConnection) { SearchPath = schema }.ConnectionString);
        repository = new WordRepository(database, clock);
        await Execute("CREATE TABLE word_pairs (word text, hint text); INSERT INTO word_pairs VALUES ('Volcano', 'Mountain');");
    }

    [Fact]
    public async Task CatalogIsCachedAndRefreshesAfterFiveMinutesWithoutCachingAnEmptyCatalog()
    {
        Assert.Equal("Volcano", (await repository.GetRandomAsync(default))!.Word);
        await Execute("DELETE FROM word_pairs;");
        Assert.Equal("Volcano", (await repository.GetRandomAsync(default))!.Word);
        clock.Advance(WordRepository.CacheLifetime);
        Assert.Null(await repository.GetRandomAsync(default));
        await Execute("INSERT INTO word_pairs VALUES ('Pizza', 'Oven');");
        Assert.Equal("Pizza", (await repository.GetRandomAsync(default))!.Word);
    }

    [Fact]
    public async Task ConcurrentRequestsShareOneCatalogReadPerRefresh()
    {
        // The sequence records actual SELECTs, including concurrent cache misses.
        await Execute("""
            DROP TABLE word_pairs;
            CREATE SEQUENCE catalog_reads;
            CREATE VIEW word_pairs AS
                SELECT 'Volcano'::text AS word, 'Mountain'::text AS hint
                WHERE nextval('catalog_reads') > 0;
            """);
        var first = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => repository.GetRandomAsync(default)));
        Assert.All(first, pair => Assert.Equal("Volcano", pair!.Word));
        Assert.Equal(1, await ReadCount());
        clock.Advance(WordRepository.CacheLifetime);
        var refreshed = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => repository.GetRandomAsync(default)));
        Assert.All(refreshed, pair => Assert.Equal("Mountain", pair!.Hint));
        Assert.Equal(2, await ReadCount());
    }

    private async Task Execute(string sql)
    {
        await using var command = database.CreateCommand(sql);
        await command.ExecuteNonQueryAsync();
    }

    private async Task<long> ReadCount()
    {
        await using var command = database.CreateCommand("SELECT last_value FROM catalog_reads;");
        return (long)(await command.ExecuteScalarAsync())!;
    }

    public async Task DisposeAsync()
    {
        repository?.Dispose();
        if (database is not null) await database.DisposeAsync();
        if (string.IsNullOrEmpty(adminConnection)) return;
        await using var admin = new NpgsqlConnection(adminConnection);
        await admin.OpenAsync();
        await using var drop = new NpgsqlCommand($"DROP SCHEMA {schema} CASCADE", admin);
        await drop.ExecuteNonQueryAsync();
    }
}
