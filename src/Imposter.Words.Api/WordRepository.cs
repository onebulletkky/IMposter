using Npgsql;

namespace Imposter.Words.Api;

public sealed class WordRepository(NpgsqlDataSource dataSource)
{
    public async Task<WordPair?> GetRandomAsync(CancellationToken cancellationToken)
    {
        await using var command = dataSource.CreateCommand("SELECT word, hint FROM word_pairs ORDER BY random() LIMIT 1;");
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new WordPair(reader.GetString(0), reader.GetString(1))
            : null;
    }

    public async Task<bool> IsReadyAsync(CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var ping = new NpgsqlCommand("SELECT 1;", connection);
        await ping.ExecuteScalarAsync(cancellationToken);
        await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM word_pairs);", connection);
        return await command.ExecuteScalarAsync(cancellationToken) is true;
    }
}
