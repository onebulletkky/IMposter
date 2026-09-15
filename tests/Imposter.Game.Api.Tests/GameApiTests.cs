using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Imposter.Game.Api.Application;
using Imposter.Game.Api.Infrastructure;
using Imposter.Game.Domain;
using Xunit;

namespace Imposter.Game.Api.Tests;

[Trait("Category", "Integration")]
public sealed class GameApiTests(GameApiFixture fixture) : IClassFixture<GameApiFixture>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    [Fact]
    public async Task MissingForgedAndOtherLobbyTokensCannotReadPrivateState()
    {
        var session = await Create("Host");
        var outsider = await Create("Outsider");
        foreach (var token in new string?[] { null, "invalid", new('A', 64), outsider.Token })
        {
            using var response = await Send(HttpMethod.Get, session.Code, token);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.DoesNotContain(session.Token, await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }
        using var valid = await Send(HttpMethod.Get, session.Code, session.Token);
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);
        Assert.True(valid.Headers.CacheControl?.NoStore);
    }

    [Fact]
    public async Task LobbyCodesNormalizeCaseAndRejectMalformedCodes()
    {
        var host = await Create("Host");
        using var join = await fixture.Client.PostAsJsonAsync($"/api/lobbies/{host.Code.ToLowerInvariant()}/join", new { nickname = "Guest" });
        var guest = await Success<SessionResponse>(join);
        Assert.Equal(host.Code, guest.Code);
        using var get = await Send(HttpMethod.Get, host.Code.ToLowerInvariant(), guest.Token);
        Assert.Equal(host.Code, (await Success<GameView>(get)).Code);
        using var invalid = await Send(HttpMethod.Get, "BAD-CODE", guest.Token);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task OnlyHostCanConfigureOrStartAndOnlyCurrentPlayerCanConfirm()
    {
        var sessions = await Lobby();
        var host = sessions[0];
        var guest = sessions[1];
        using var settings = await Send(HttpMethod.Put, host.Code, guest.Token, "/settings", new GameSettings());
        Assert.Equal(HttpStatusCode.Conflict, settings.StatusCode);
        using var invalidStart = await Send(HttpMethod.Post, host.Code, guest.Token, "/start");
        Assert.Equal(HttpStatusCode.Conflict, invalidStart.StatusCode);
        var started = await Start(host);
        var wrongPlayer = sessions.First(session => session.PlayerId != started.CurrentPlayerId);
        using var invalidTurn = await Send(HttpMethod.Post, host.Code, wrongPlayer.Token, "/turn", new { turnNumber = started.TurnNumber });
        Assert.Equal(HttpStatusCode.Conflict, invalidTurn.StatusCode);
        using var reread = await Send(HttpMethod.Get, host.Code, host.Token);
        var unchanged = await Success<GameView>(reread);
        Assert.Equal(started.TurnNumber, unchanged.TurnNumber);
        Assert.Equal(started.Version, unchanged.Version);
    }

    [Fact]
    public async Task ConcurrentTurnConfirmationsAdvanceExactlyOnceAcrossApiInstances()
    {
        var sessions = await Lobby();
        var started = await Start(sessions[0]);
        var current = sessions.Single(session => session.PlayerId == started.CurrentPlayerId);
        await using var otherFactory = fixture.NewFactory();
        using var otherClient = otherFactory.CreateClient();
        var firstTask = Send(HttpMethod.Post, current.Code, current.Token, "/turn", new { turnNumber = started.TurnNumber });
        var secondTask = Send(HttpMethod.Post, current.Code, current.Token, "/turn", new { turnNumber = started.TurnNumber }, otherClient);
        var responses = await Task.WhenAll(firstTask, secondTask);
        try
        {
            Assert.Single(responses, response => response.StatusCode == HttpStatusCode.OK);
            Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Conflict);
        }
        finally { foreach (var response in responses) response.Dispose(); }
        using var read = await Send(HttpMethod.Get, current.Code, current.Token);
        var state = await Success<GameView>(read);
        Assert.Equal(started.TurnNumber + 1, state.TurnNumber);
        Assert.Equal(started.Version + 1, state.Version);
    }

    [Fact]
    public async Task ConcurrentDuplicateVotesCountOnceAndAllPlayersReachGuessing()
    {
        var sessions = await Lobby();
        await Start(sessions[0]);
        fixture.Clock.Advance(TimeSpan.FromMinutes(2));
        using var votingResponse = await Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token);
        var voting = await Success<GameView>(votingResponse);
        Assert.Equal(GamePhase.Voting, voting.Phase);

        var votes = await Task.WhenAll(
            Send(HttpMethod.Post, sessions[0].Code, sessions[0].Token, "/votes", new { targetId = sessions[1].PlayerId }),
            Send(HttpMethod.Post, sessions[0].Code, sessions[0].Token, "/votes", new { targetId = sessions[2].PlayerId }));
        try
        {
            Assert.Single(votes, response => response.StatusCode == HttpStatusCode.OK);
            Assert.Single(votes, response => response.StatusCode == HttpStatusCode.Conflict);
        }
        finally { foreach (var response in votes) response.Dispose(); }

        using var middleResponse = await Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token);
        var middle = await Success<GameView>(middleResponse);
        Assert.Equal(1, middle.VotesCast);
        Assert.Equal(voting.Version + 1, middle.Version);
        Assert.All(middle.Players, player => Assert.Null(player.VoteCount));

        var remaining = await Task.WhenAll(
            Send(HttpMethod.Post, sessions[0].Code, sessions[1].Token, "/votes", new { targetId = sessions[0].PlayerId }),
            Send(HttpMethod.Post, sessions[0].Code, sessions[2].Token, "/votes", new { targetId = sessions[0].PlayerId }));
        foreach (var response in remaining)
        {
            using (response) Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        using var finalResponse = await Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token);
        var final = await Success<GameView>(finalResponse);
        Assert.Equal(GamePhase.Guessing, final.Phase);
        Assert.Equal(3, final.VotesCast);
        Assert.Equal(1, final.GuessesRemaining);
        Assert.Equal(voting.Version + 3, final.Version);
    }

    [Fact]
    public async Task PersistedRoomSurvivesNewApiInstanceWithoutLeakingOtherRolesOrTokens()
    {
        var sessions = await Lobby();
        var started = await Start(sessions[0]);
        SessionResponse? impostor = null;
        foreach (var session in sessions)
        {
            using var read = await Send(HttpMethod.Get, session.Code, session.Token);
            var view = await Success<GameView>(read);
            if (view.Self.IsImpostor == true) impostor = session;
        }
        Assert.NotNull(impostor);

        var stored = await fixture.StoredState(impostor.Code);
        Assert.Contains("Volcano", stored, StringComparison.Ordinal);
        Assert.Contains(GameStore.HashToken(impostor.Token), stored, StringComparison.Ordinal);
        Assert.DoesNotContain(impostor.Token, stored, StringComparison.Ordinal);

        await using var restartedFactory = fixture.NewFactory();
        using var restartedClient = restartedFactory.CreateClient();
        using var restoredResponse = await Send(HttpMethod.Get, impostor.Code, impostor.Token, client: restartedClient);
        var wireJson = await restoredResponse.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Volcano", wireJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", wireJson, StringComparison.OrdinalIgnoreCase);
        var restored = await Success<GameView>(restoredResponse);
        Assert.Equal(started.Version, restored.Version);
        Assert.Equal(started.CurrentPlayerId, restored.CurrentPlayerId);
        Assert.Equal("Mountain", restored.Self.Word);
        Assert.Null(restored.RevealedWord);
        Assert.All(restored.Players, player => Assert.Null(player.IsImpostor));

        fixture.Clock.Advance(TimeSpan.FromMinutes(2));
        for (var i = 0; i < sessions.Length; i++)
        {
            using var vote = await Send(HttpMethod.Post, impostor.Code, sessions[i].Token, "/votes",
                new { targetId = sessions[(i + 1) % sessions.Length].PlayerId }, restartedClient);
            Assert.Equal(HttpStatusCode.OK, vote.StatusCode);
        }
        var crew = sessions.First(session => session.PlayerId != impostor.PlayerId);
        using var blockedGuess = await Send(HttpMethod.Post, impostor.Code, crew.Token, "/guesses", new { word = "Volcano" }, restartedClient);
        Assert.Equal(HttpStatusCode.Conflict, blockedGuess.StatusCode);
        using var guess = await Send(HttpMethod.Post, impostor.Code, impostor.Token, "/guesses", new { word = "  VOLCANO  " }, restartedClient);
        var finished = await Success<GameView>(guess);
        Assert.Equal(GamePhase.Finished, finished.Phase);
        Assert.Equal("Volcano", finished.RevealedWord);
        Assert.Equal("Impostors", finished.WinningTeam);
        Assert.All(finished.Players, player => Assert.NotNull(player.IsImpostor));
    }

    [Fact]
    public async Task CachedReadsAuthenticateEachPlayerAndLocalChangesInvalidateTheSnapshot()
    {
        var sessions = await Lobby();
        using var warm = await Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token);
        Assert.Equal(HttpStatusCode.OK, warm.StatusCode);
        using var forged = await Send(HttpMethod.Get, sessions[0].Code, new string('A', 64));
        Assert.Equal(HttpStatusCode.Unauthorized, forged.StatusCode);
        using var guest = await Send(HttpMethod.Get, sessions[0].Code, sessions[1].Token);
        Assert.Equal(sessions[1].PlayerId, (await Success<GameView>(guest)).Self.Id);
        using var settings = await Send(HttpMethod.Put, sessions[0].Code, sessions[0].Token,
            "/settings", new GameSettings { RoundCount = 5 });
        Assert.Equal(HttpStatusCode.OK, settings.StatusCode);
        using var changed = await Send(HttpMethod.Get, sessions[0].Code, sessions[1].Token);
        Assert.Equal(5, (await Success<GameView>(changed)).Settings.RoundCount);
        using var leave = await Send(HttpMethod.Delete, sessions[0].Code, sessions[1].Token, "/players/me");
        Assert.Equal(HttpStatusCode.NoContent, leave.StatusCode);
        using var removed = await Send(HttpMethod.Get, sessions[0].Code, sessions[1].Token);
        Assert.Equal(HttpStatusCode.Unauthorized, removed.StatusCode);
    }

    [Fact]
    public async Task CacheRefreshesChangesFromOtherInstancesWithinTwoSeconds()
    {
        var sessions = await Lobby();
        using var warm = await Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token);
        var original = await Success<GameView>(warm);
        await using var otherFactory = fixture.NewFactory();
        using var otherClient = otherFactory.CreateClient();
        using var settings = await Send(HttpMethod.Put, sessions[0].Code, sessions[0].Token,
            "/settings", new GameSettings { RoundCount = 5 }, otherClient);
        Assert.Equal(HttpStatusCode.OK, settings.StatusCode);
        using var cached = await Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token);
        Assert.Equal(original.Version, (await Success<GameView>(cached)).Version);
        fixture.Clock.Advance(RoomReadCache.Lifetime);
        using var refreshed = await Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token);
        Assert.Equal(5, (await Success<GameView>(refreshed)).Settings.RoundCount);
    }

    [Fact]
    public async Task CachedTurnIsReconciledAtItsDeadlineEvenBeforeCacheLifetimeEnds()
    {
        var sessions = await Lobby();
        var started = await Start(sessions[0]);
        fixture.Clock.Advance(TimeSpan.FromSeconds(29));
        using var warm = await Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token);
        Assert.Equal(started.TurnNumber, (await Success<GameView>(warm)).TurnNumber);
        fixture.Clock.Advance(TimeSpan.FromSeconds(1));
        using var expired = await Send(HttpMethod.Get, sessions[0].Code, sessions[1].Token);
        var advanced = await Success<GameView>(expired);
        Assert.Equal(started.TurnNumber + 1, advanced.TurnNumber);
        Assert.Equal(started.TurnEndsAt!.Value.AddSeconds(30), advanced.TurnEndsAt);
    }

    [Fact]
    public async Task SleepingGameCatchesUpOnceAcrossFreshInstancesWithoutExtendingDeadlines()
    {
        var sessions = await Lobby();
        var started = await Start(sessions[0]);
        fixture.Clock.Advance(TimeSpan.FromSeconds(65));
        using (var stored = JsonDocument.Parse(await fixture.StoredState(sessions[0].Code)))
            Assert.Equal(1, stored.RootElement.GetProperty("turnNumber").GetInt32());

        await using var firstFactory = fixture.NewFactory();
        await using var secondFactory = fixture.NewFactory();
        using var firstClient = firstFactory.CreateClient();
        using var secondClient = secondFactory.CreateClient();
        var responses = await Task.WhenAll(
            Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token, client: firstClient),
            Send(HttpMethod.Get, sessions[0].Code, sessions[1].Token, client: secondClient));
        foreach (var response in responses)
        {
            using (response)
            {
                var view = await Success<GameView>(response);
                Assert.Equal(3, view.TurnNumber);
                Assert.Equal(started.TurnEndsAt!.Value.AddSeconds(60), view.TurnEndsAt);
                Assert.Equal(started.Version + 1, view.Version);
            }
        }
        fixture.Clock.Advance(TimeSpan.FromSeconds(30));
        using var voting = await Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token, client: firstClient);
        var finishedTurns = await Success<GameView>(voting);
        Assert.Equal(GamePhase.Voting, finishedTurns.Phase);
        Assert.Null(finishedTurns.TurnEndsAt);
    }

    [Fact]
    public async Task ExpiredLobbyCannotWakeAndIsRemovedWhenAnotherLobbyIsCreated()
    {
        var session = await Create("Expired");
        await fixture.ExpireRoom(session.Code);
        using var missing = await Send(HttpMethod.Get, session.Code, session.Token);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        await Create("New host");
        Assert.Null(await fixture.StoredState(session.Code));
    }

    [Fact]
    public async Task WakingWordServiceDoesNotUseUpTheFirstPlayersTurn()
    {
        var sessions = await Lobby();
        var before = fixture.Clock.GetUtcNow();
        await using var coldFactory = fixture.NewFactory(() => fixture.Clock.Advance(TimeSpan.FromSeconds(60)));
        using var coldClient = coldFactory.CreateClient();
        using var response = await Send(HttpMethod.Post, sessions[0].Code, sessions[0].Token, "/start", client: coldClient);
        var started = await Success<GameView>(response);
        Assert.Equal(before.AddSeconds(60), started.ServerTime);
        Assert.Equal(started.ServerTime.AddSeconds(started.Settings.TurnSeconds), started.TurnEndsAt);
        Assert.Equal(1, started.TurnNumber);
    }
    [Fact]
    public async Task CachedPollsAndIdleApplicationDoNotQueryPostgres()
    {
        var sessions = await Lobby();
        await using var isolatedFactory = fixture.NewFactory();
        using var isolatedClient = isolatedFactory.CreateClient();
        using var warm = await Send(HttpMethod.Get, sessions[0].Code, sessions[0].Token, client: isolatedClient);
        Assert.Equal(HttpStatusCode.OK, warm.StatusCode);
        var lastQuery = await fixture.LastDatabaseActivity(isolatedFactory.ApplicationName);
        var polls = await Task.WhenAll(Enumerable.Range(0, 12).Select(i =>
            Send(HttpMethod.Get, sessions[0].Code, sessions[i % 3].Token, client: isolatedClient)));
        foreach (var response in polls)
        {
            using (response) Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        Assert.Equal(lastQuery, await fixture.LastDatabaseActivity(isolatedFactory.ApplicationName));
        // A saved room with nobody requesting updates does not cause timer scans.
        await Task.Delay(TimeSpan.FromMilliseconds(2200));
        Assert.Equal(lastQuery, await fixture.LastDatabaseActivity(isolatedFactory.ApplicationName));
    }
    private async Task<SessionResponse> Create(string nickname)
    {
        using var response = await fixture.Client.PostAsJsonAsync("/api/lobbies/", new { nickname });
        return await Success<SessionResponse>(response);
    }

    private async Task<SessionResponse[]> Lobby()
    {
        var host = await Create("Host");
        var sessions = new List<SessionResponse> { host };
        for (var i = 1; i <= 2; i++)
        {
            using var response = await fixture.Client.PostAsJsonAsync($"/api/lobbies/{host.Code}/join", new { nickname = $"Guest {i}" });
            sessions.Add(await Success<SessionResponse>(response));
        }
        return sessions.ToArray();
    }

    private async Task<GameView> Start(SessionResponse host)
    {
        using var settings = await Send(HttpMethod.Put, host.Code, host.Token, "/settings", new GameSettings { RoundCount = 1 });
        Assert.Equal(HttpStatusCode.OK, settings.StatusCode);
        using var response = await Send(HttpMethod.Post, host.Code, host.Token, "/start");
        return await Success<GameView>(response);
    }

    private async Task<HttpResponseMessage> Send(HttpMethod method, string code, string? token, string suffix = "", object? body = null, HttpClient? client = null)
    {
        using var request = new HttpRequestMessage(method, $"/api/lobbies/{code}{suffix}");
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null) request.Content = JsonContent.Create(body);
        return await (client ?? fixture.Client).SendAsync(request);
    }

    private static async Task<T> Success<T>(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"HTTP {(int)response.StatusCode}: {text}");
        return JsonSerializer.Deserialize<T>(text, Json)!;
    }
}
