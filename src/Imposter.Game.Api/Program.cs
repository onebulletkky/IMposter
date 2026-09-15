using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Imposter.Game.Api.Application;
using Imposter.Game.Api.Infrastructure;
using Imposter.Game.Domain;
using MediatR;
using Microsoft.AspNetCore.RateLimiting;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddMediatR(c => c.RegisterServicesFromAssemblyContaining<CreateLobby>());
builder.Services.AddSingleton(TimeProvider.System);
var connectionString = builder.Configuration.GetConnectionString("Games");
if (string.IsNullOrWhiteSpace(connectionString)) throw new InvalidOperationException("ConnectionStrings:Games is required.");
var serviceKey = builder.Configuration["Services:ApiKey"];
if (string.IsNullOrWhiteSpace(serviceKey)) throw new InvalidOperationException("Services:ApiKey is required.");
builder.Services.AddSingleton(NpgsqlDataSource.Create(connectionString));
builder.Services.AddSingleton<GameStore>();
builder.Services.AddHttpClient<WordClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Services:WordsUrl"] ?? "http://localhost:5081");
    client.DefaultRequestHeaders.Add("X-Service-Key", serviceKey);
    client.Timeout = TimeSpan.FromSeconds(5);
});
builder.Services.AddHostedService<TurnWorker>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("entry", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0
        }));
    options.OnRejected = async (context, ct) =>
        await Results.Problem("Too many lobby attempts. Wait a minute and try again.", statusCode: 429).ExecuteAsync(context.HttpContext);
});

var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    try { await next(context); }
    catch (GameRuleException e) { await Results.Problem(e.Message, statusCode: 409, title: "Game action unavailable").ExecuteAsync(context); }
    catch (ApiException e) { await Results.Problem(e.Message, statusCode: e.StatusCode, title: "Request could not be completed").ExecuteAsync(context); }
    catch (BadHttpRequestException e) { await Results.Problem("Check the request fields and try again.", statusCode: e.StatusCode).ExecuteAsync(context); }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
    catch (NpgsqlException e)
    {
        app.Logger.LogError(e, "Lobby storage request failed.");
        await Results.Problem("Lobby storage is temporarily unavailable. Please try again.", statusCode: 503).ExecuteAsync(context);
    }
    catch (Exception e)
    {
        app.Logger.LogError(e, "Unexpected game request failure.");
        await Results.Problem("An unexpected error occurred. Please try again.", statusCode: 500).ExecuteAsync(context);
    }
});
app.UseRateLimiter();
app.MapGet("/health/live", () => Results.Ok(new { status = "healthy" }));
app.MapGet("/health/ready", async (NpgsqlDataSource db, CancellationToken ct) =>
{
    await using var command = db.CreateCommand("SELECT 1 FROM lobbies LIMIT 1");
    await command.ExecuteScalarAsync(ct);
    return Results.Ok(new { status = "ready" });
});

var lobbies = app.MapGroup("/api/lobbies");
lobbies.MapPost("/", async (NicknameBody body, ISender sender, CancellationToken ct) =>
    Results.Ok(await sender.Send(new CreateLobby(body.Nickname ?? ""), ct))).RequireRateLimiting("entry");
lobbies.MapPost("/{code}/join", async (string code, NicknameBody body, ISender sender, CancellationToken ct) =>
    Results.Ok(await sender.Send(new JoinLobby(code, body.Nickname ?? ""), ct))).RequireRateLimiting("entry");
lobbies.MapGet("/{code}", async (string code, HttpContext ctx, ISender sender, CancellationToken ct) =>
    Results.Ok(await sender.Send(new RoomRequest(code, Token(ctx), RoomAction.Read), ct)));
lobbies.MapPut("/{code}/settings", async (string code, GameSettings body, HttpContext ctx, ISender sender, CancellationToken ct) =>
    Results.Ok(await sender.Send(new RoomRequest(code, Token(ctx), RoomAction.Settings, Settings: body), ct)));
lobbies.MapPost("/{code}/start", async (string code, HttpContext ctx, ISender sender, CancellationToken ct) =>
    Results.Ok(await sender.Send(new RoomRequest(code, Token(ctx), RoomAction.Start), ct)));
lobbies.MapPost("/{code}/turn", async (string code, TurnBody body, HttpContext ctx, ISender sender, CancellationToken ct) =>
    Results.Ok(await sender.Send(new RoomRequest(code, Token(ctx), RoomAction.ConfirmTurn, TurnNumber: body.TurnNumber), ct)));
lobbies.MapPost("/{code}/votes", async (string code, VoteBody body, HttpContext ctx, ISender sender, CancellationToken ct) =>
    Results.Ok(await sender.Send(new RoomRequest(code, Token(ctx), RoomAction.Vote, TargetId: body.TargetId), ct)));
lobbies.MapPost("/{code}/guesses", async (string code, GuessBody body, HttpContext ctx, ISender sender, CancellationToken ct) =>
    Results.Ok(await sender.Send(new RoomRequest(code, Token(ctx), RoomAction.Guess, Word: body.Word), ct)));
lobbies.MapPost("/{code}/restart", async (string code, HttpContext ctx, ISender sender, CancellationToken ct) =>
    Results.Ok(await sender.Send(new RoomRequest(code, Token(ctx), RoomAction.Restart), ct)));
lobbies.MapDelete("/{code}/players/me", async (string code, HttpContext ctx, ISender sender, CancellationToken ct) =>
{
    await sender.Send(new RoomRequest(code, Token(ctx), RoomAction.Leave), ct);
    return Results.NoContent();
});

for (var attempt = 1; ; attempt++)
{
    try { await app.Services.GetRequiredService<GameStore>().Initialize(app.Lifetime.ApplicationStopping); break; }
    catch (NpgsqlException) when (attempt < 10)
    {
        app.Logger.LogWarning("Waiting for lobby storage, attempt {Attempt}.", attempt);
        await Task.Delay(TimeSpan.FromSeconds(2), app.Lifetime.ApplicationStopping);
    }
}
await app.RunAsync();

static string Token(HttpContext context)
{
    var authorization = context.Request.Headers.Authorization.ToString();
    if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        throw new ApiException(401, "A player session is required.");
    return authorization[7..];
}

public sealed record NicknameBody(string? Nickname);
public sealed record TurnBody(int TurnNumber);
public sealed record VoteBody(Guid TargetId);
public sealed record GuessBody(string? Word);
public partial class Program;
