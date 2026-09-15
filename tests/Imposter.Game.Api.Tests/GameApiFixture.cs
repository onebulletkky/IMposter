using System.Net;
using System.Net.Http.Json;
using Imposter.Game.Api.Infrastructure;
using Imposter.Game.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Xunit;

namespace Imposter.Game.Api.Tests;

public sealed class GameApiFixture : IAsyncLifetime
{
    private readonly string schema = "game_api_test_" + Guid.NewGuid().ToString("N");
    private string adminConnection = "";
    private string connection = "";
    private GameApiFactory? factory;
    public HttpClient Client { get; private set; } = null!;
    public TestClock Clock { get; } = new();

    public async Task InitializeAsync()
    {
        adminConnection = Environment.GetEnvironmentVariable("TEST_GAMES_CONNECTION")
            ?? throw new InvalidOperationException(
                "TEST_GAMES_CONNECTION is required for API integration tests. Point it at a PostgreSQL test database; see this project's README.md.");
        await using var admin = new NpgsqlConnection(adminConnection);
        await admin.OpenAsync();
        await using var create = new NpgsqlCommand($"CREATE SCHEMA {schema}", admin);
        await create.ExecuteNonQueryAsync();
        var builder = new NpgsqlConnectionStringBuilder(adminConnection) { SearchPath = schema };
        connection = builder.ConnectionString;
        factory = NewFactory();
        Client = factory.CreateClient();
        using var response = await Client.GetAsync("/health/ready");
        response.EnsureSuccessStatusCode();
    }

    public GameApiFactory NewFactory() => new(connection, Clock);

    public async Task<string> StoredState(string code)
    {
        await using var database = new NpgsqlConnection(connection);
        await database.OpenAsync();
        await using var command = new NpgsqlCommand("SELECT state::text FROM lobbies WHERE code = @code", database);
        command.Parameters.AddWithValue("code", code);
        return (string)(await command.ExecuteScalarAsync())!;
    }

    public async Task DisposeAsync()
    {
        Client?.Dispose();
        if (factory is not null) await factory.DisposeAsync();
        if (string.IsNullOrWhiteSpace(connection)) return;
        await using var admin = new NpgsqlConnection(adminConnection);
        await admin.OpenAsync();
        await using var drop = new NpgsqlCommand($"DROP SCHEMA {schema} CASCADE", admin);
        await drop.ExecuteNonQueryAsync();
    }
}

public sealed class GameApiFactory(string connection, TestClock clock) : WebApplicationFactory<Program>
{
    protected override IHost CreateHost(IHostBuilder builder)
    {
        // Minimal-host startup reads these values before web-host callbacks run.
        builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Games"] = connection,
            ["Services:ApiKey"] = "integration-test-service-key",
            ["Services:WordsUrl"] = "http://words.test"
        }));
        return base.CreateHost(builder);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(clock);
            services.AddHttpClient<WordClient>().ConfigurePrimaryHttpMessageHandler(() => new TestWordsHandler());
            foreach (var worker in services.Where(service => service.ServiceType == typeof(IHostedService)
                         && service.ImplementationType == typeof(TurnWorker)).ToArray())
                services.Remove(worker);
        });
    }

    private sealed class TestWordsHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new WordPair("Volcano", "Mountain")) });
    }
}

public sealed class TestClock : TimeProvider
{
    private long utcTicks = DateTimeOffset.UtcNow.UtcTicks;
    public override DateTimeOffset GetUtcNow() => new(Interlocked.Read(ref utcTicks), TimeSpan.Zero);
    public void Advance(TimeSpan duration) => Interlocked.Add(ref utcTicks, duration.Ticks);
}
