using Imposter.Words.Api;
using MediatR;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Words");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("ConnectionStrings:Words must be configured.");
}

var serviceKey = builder.Configuration["Services:ApiKey"];
if (string.IsNullOrWhiteSpace(serviceKey))
{
    throw new InvalidOperationException("Services:ApiKey must be configured.");
}

// Short database timeouts keep health probes and startup retries bounded.
var connectionOptions = new NpgsqlConnectionStringBuilder(connectionString)
{
    Timeout = 5,
    CommandTimeout = 5,
    IncludeErrorDetail = false
};

builder.Services.AddSingleton(NpgsqlDataSource.Create(connectionOptions.ConnectionString));
builder.Services.AddSingleton(new ServiceKeyGuard(serviceKey));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<WordRepository>();
builder.Services.AddMediatR(configuration =>
    configuration.RegisterServicesFromAssemblyContaining<GetRandomWordQuery>());
builder.Services.AddHostedService<DatabaseInitializer>();

var app = builder.Build();

app.MapGet("/health/live", () => Results.Ok(new { status = "healthy" }));

app.MapGet("/health/ready", async (WordRepository words, CancellationToken cancellationToken) =>
{
    try
    {
        return await words.IsReadyAsync(cancellationToken)
            ? Results.Ok(new { status = "healthy" })
            : Results.Json(new { status = "unhealthy", reason = "No words are configured." }, statusCode: 503);
    }
    catch (Exception exception) when (exception is NpgsqlException or TimeoutException)
    {
        return Results.Json(new { status = "unhealthy", reason = "The word catalog is unavailable." }, statusCode: 503);
    }
});

app.MapGet("/internal/words/random", async (ISender sender, CancellationToken cancellationToken) =>
{
    try
    {
        var pair = await sender.Send(new GetRandomWordQuery(), cancellationToken);
        return pair is null
            ? Results.Problem("No words are configured.", statusCode: 503)
            : Results.Ok(pair);
    }
    catch (Exception exception) when (exception is NpgsqlException or TimeoutException)
    {
        return Results.Problem("The word catalog is unavailable.", statusCode: 503);
    }
})
.AddEndpointFilter<ServiceKeyFilter>();

app.Run();

public partial class Program;
