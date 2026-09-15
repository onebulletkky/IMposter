using Npgsql;

namespace Imposter.Words.Api;

public sealed class DatabaseInitializer(
    NpgsqlDataSource dataSource,
    IConfiguration configuration,
    ILogger<DatabaseInitializer> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(30));
        var cancellationToken = deadline.Token;
        var schemaPath = Path.Combine(AppContext.BaseDirectory, "db", "schema.sql");
        var schema = await File.ReadAllTextAsync(schemaPath, stoppingToken);
        var demoSeed = configuration.GetValue<bool>("SeedDemoWords")
            ? await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "db", "seed-demo.sql"), stoppingToken)
            : null;

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
                    await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                    await using var createTable = new NpgsqlCommand(schema, connection, transaction);
                    await createTable.ExecuteNonQueryAsync(cancellationToken);

                    if (demoSeed is not null)
                    {
                        await using var insertWords = new NpgsqlCommand(demoSeed, connection, transaction);
                        await insertWords.ExecuteNonQueryAsync(cancellationToken);
                    }

                    await transaction.CommitAsync(cancellationToken);
                    logger.LogInformation("Word catalog database initialization completed. Demo seed enabled: {SeedDemoWords}.", demoSeed is not null);
                    return;
                }
                catch (Exception exception) when (exception is NpgsqlException or TimeoutException)
                {
                    // Exception messages can include SQL details. Do not log words, hints, or connection secrets.
                    logger.LogWarning("Word catalog database initialization is waiting for PostgreSQL.");
                    await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            if (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }

        logger.LogError("Word catalog database initialization did not complete within 30 seconds. Readiness remains unhealthy until the schema and word catalog are available. Restart this service after fixing the database.");
    }
}
