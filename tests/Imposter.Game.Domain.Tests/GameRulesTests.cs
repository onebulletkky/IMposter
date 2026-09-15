using System.Text.Json;
using System.Text.Json.Serialization;
using Imposter.Game.Domain;
using Xunit;

namespace Imposter.Game.Domain.Tests;

public sealed class GameRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 15, 12, 0, 0, TimeSpan.Zero);
    private static readonly WordPair Pair = new("Volcano", "Mountain");

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("a nickname longer than 24 characters")]
    [InlineData("line\nbreak")]
    public void NicknameIsRequiredAndValidated(string nickname)
    {
        Assert.Throws<GameRuleException>(() => GameRules.Create("ABCDE", Player(nickname)));
    }

    [Fact]
    public void LobbyTrimsNicknamesAndRejectsCaseInsensitiveDuplicates()
    {
        var room = GameRules.Create("A2BCD", Player("  Alex  "));
        Assert.Equal("Alex", room.Players[0].Nickname);
        Assert.Throws<GameRuleException>(() => GameRules.Join(room, Player("alex")));
    }

    [Theory]
    [InlineData("ABCD")]
    [InlineData("ABCDEF")]
    [InlineData("abcde")]
    [InlineData("AB-CD")]
    public void CodeContainsExactlyFiveUppercaseAlphanumericCharacters(string code)
    {
        Assert.Throws<GameRuleException>(() => GameRules.Create(code, Player("Alex")));
    }

    [Fact]
    public void LobbyTransfersHostAndCanBecomeEmpty()
    {
        var room = Lobby();
        var secondId = room.Players[1].Id;
        GameRules.Leave(room, room.HostId);
        Assert.Equal(secondId, room.HostId);
        GameRules.Leave(room, room.HostId);
        GameRules.Leave(room, room.HostId);
        Assert.Empty(room.Players);
        Assert.Equal(Guid.Empty, room.HostId);
    }

    [Fact]
    public void OnlyHostCanChangeSettingsOrStart()
    {
        var room = Lobby();
        var other = room.Players[1].Id;
        Assert.Throws<GameRuleException>(() => GameRules.UpdateSettings(room, other, new GameSettings()));
        Assert.Throws<GameRuleException>(() => GameRules.Start(room, other, Pair, Now));
    }

    [Theory]
    [InlineData(0, 0, 3, 30)]
    [InlineData(6, 0, 3, 30)]
    [InlineData(1, -1, 3, 30)]
    [InlineData(1, 101, 3, 30)]
    [InlineData(1, 0, 0, 30)]
    [InlineData(1, 0, 11, 30)]
    [InlineData(1, 0, 3, 9)]
    [InlineData(1, 0, 3, 181)]
    public void InvalidSettingsAreRejectedWithoutChangingLobby(int impostors, int chance, int rounds, int seconds)
    {
        var room = Lobby();
        Assert.Throws<GameRuleException>(() => GameRules.UpdateSettings(room, room.HostId, new GameSettings
        {
            ImpostorCount = impostors,
            ExtraImpostorChancePercent = chance,
            RoundCount = rounds,
            TurnSeconds = seconds
        }));
        Assert.Equal(1, room.Settings.ImpostorCount);
        Assert.Equal(0, room.Settings.ExtraImpostorChancePercent);
        Assert.Equal(3, room.Settings.RoundCount);
        Assert.Equal(30, room.Settings.TurnSeconds);
    }

    [Fact]
    public void LobbyRequiresThreePlayersToStartAndAllowsAtMostSixteen()
    {
        var smallRoom = Lobby(2);
        Assert.Throws<GameRuleException>(() => GameRules.Start(smallRoom, smallRoom.HostId, Pair, Now));
        var fullRoom = Lobby(16);
        Assert.Throws<GameRuleException>(() => GameRules.Join(fullRoom, Player("Player 17")));
        GameRules.Start(fullRoom, fullRoom.HostId, Pair, Now);
        Assert.Equal(GamePhase.Playing, fullRoom.Phase);
    }

    [Fact]
    public void StartingRequiresEnoughRegularPlayersEvenWithChanceForExtraImpostor()
    {
        var room = Lobby();
        GameRules.UpdateSettings(room, room.HostId, new GameSettings { ImpostorCount = 2, ExtraImpostorChancePercent = 1 });
        Assert.Throws<GameRuleException>(() => GameRules.Start(room, room.HostId, Pair, Now));
        Assert.Equal(GamePhase.Lobby, room.Phase);
        Assert.All(room.Players, player => Assert.False(player.IsImpostor));
        Assert.Null(room.CommonWord);
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(100, 2)]
    public void ExtraImpostorChanceRespectsBoundaries(int chance, int expectedImpostors)
    {
        var room = Lobby();
        GameRules.UpdateSettings(room, room.HostId, new GameSettings { ExtraImpostorChancePercent = chance });
        GameRules.Start(room, room.HostId, Pair, Now);
        Assert.Equal(expectedImpostors, room.Players.Count(player => player.IsImpostor));
    }

    [Fact]
    public void EveryPlayerTakesATurnInEveryRoundBeforeVoting()
    {
        var room = Started(rounds: 2);
        for (var turn = 1; turn <= 6; turn++)
        {
            Assert.Equal(GamePhase.Playing, room.Phase);
            Assert.Equal(turn, room.TurnNumber);
            Assert.Equal((turn - 1) / 3 + 1, room.RoundNumber);
            Assert.Equal((turn - 1) % 3, room.CurrentTurnIndex);
            GameRules.ConfirmTurn(room, room.Players[room.CurrentTurnIndex].Id, turn, Now.AddSeconds(turn));
        }
        Assert.Equal(GamePhase.Voting, room.Phase);
        Assert.Null(room.TurnEndsAt);
    }

    [Fact]
    public void TurnConfirmationRejectsOtherPlayersAndStaleRepeatedRequests()
    {
        var room = Started(rounds: 2);
        var host = room.HostId;
        Assert.Throws<GameRuleException>(() => GameRules.ConfirmTurn(room, room.Players[1].Id, 1, Now));
        GameRules.ConfirmTurn(room, host, 1, Now);
        Assert.Throws<GameRuleException>(() => GameRules.ConfirmTurn(room, host, 1, Now));
        GameRules.ConfirmTurn(room, room.Players[1].Id, 2, Now);
        GameRules.ConfirmTurn(room, room.Players[2].Id, 3, Now);
        Assert.Throws<GameRuleException>(() => GameRules.ConfirmTurn(room, host, 1, Now));
        Assert.Equal(4, room.TurnNumber);
    }

    [Fact]
    public void ExpiryUsesServerDeadlineAndCatchesUpWithoutExtendingRounds()
    {
        var room = Started(rounds: 2);
        Assert.False(GameRules.AdvanceExpiredTurn(room, Now.AddSeconds(29)));
        Assert.Throws<GameRuleException>(() => GameRules.ConfirmTurn(room, room.HostId, 1, Now.AddSeconds(30)));
        Assert.True(GameRules.AdvanceExpiredTurn(room, Now.AddSeconds(95)));
        Assert.Equal(4, room.TurnNumber);
        Assert.Equal(2, room.RoundNumber);
        Assert.Equal(Now.AddSeconds(120), room.TurnEndsAt);
        Assert.True(GameRules.AdvanceExpiredTurn(room, Now.AddSeconds(180)));
        Assert.Equal(GamePhase.Voting, room.Phase);
        Assert.False(GameRules.AdvanceExpiredTurn(room, Now.AddSeconds(300)));
    }

    [Fact]
    public void MembershipAndSettingsAreFrozenDuringGame()
    {
        var room = Started();
        Assert.Throws<GameRuleException>(() => GameRules.Join(room, Player("Late")));
        Assert.Throws<GameRuleException>(() => GameRules.Leave(room, room.HostId));
        Assert.Throws<GameRuleException>(() => GameRules.UpdateSettings(room, room.HostId, new GameSettings()));
        Assert.Throws<GameRuleException>(() => GameRules.Restart(room, room.HostId));
    }

    [Fact]
    public void VoteRequiresOneNonSelfVoteFromEachPlayer()
    {
        var room = Voting();
        var players = room.Players;
        Assert.Throws<GameRuleException>(() => GameRules.Vote(room, players[0].Id, players[0].Id));
        Assert.Throws<GameRuleException>(() => GameRules.Vote(room, players[0].Id, Guid.NewGuid()));
        GameRules.Vote(room, players[0].Id, players[1].Id);
        Assert.Throws<GameRuleException>(() => GameRules.Vote(room, players[0].Id, players[2].Id));
        GameRules.Vote(room, players[1].Id, players[0].Id);
        Assert.Equal(GamePhase.Voting, room.Phase);
        Assert.All(GameRules.ToView(room, room.HostId, Now).Players, player => Assert.Null(player.VoteCount));
        GameRules.Vote(room, players[2].Id, players[0].Id);
        Assert.Equal(GamePhase.Guessing, room.Phase);
        Assert.False(room.IsVoteTie);
        Assert.Equal(1, room.GuessesRemaining);
    }

    [Fact]
    public void OnlyImpostorCanGuessAndCorrectWordWinsIgnoringCaseAndOuterSpaces()
    {
        var room = Guessing(tie: false);
        Assert.Throws<GameRuleException>(() => GameRules.Guess(room, room.Players[1].Id, "Volcano"));
        Assert.Throws<GameRuleException>(() => GameRules.Guess(room, room.HostId, "  "));
        GameRules.Guess(room, room.HostId, "  vOlCaNo  ");
        Assert.Equal(GamePhase.Finished, room.Phase);
        Assert.Equal("Impostors", room.WinningTeam);
        Assert.True(Assert.Single(room.Guesses).IsCorrect);
        Assert.Equal("Volcano", GameRules.ToView(room, room.HostId, Now).RevealedWord);
    }

    [Fact]
    public void WrongSingleGuessLetsRegularPlayersWin()
    {
        var room = Guessing(tie: false);
        GameRules.Guess(room, room.HostId, "Hill");
        Assert.Equal(GamePhase.Finished, room.Phase);
        Assert.Equal("Crew", room.WinningTeam);
        Assert.Throws<GameRuleException>(() => GameRules.Guess(room, room.HostId, "Volcano"));
    }

    [Fact]
    public void TieGrantsThreeGuessesAndKeepsWordSecretUntilLastAttempt()
    {
        var room = Guessing(tie: true);
        Assert.True(room.IsVoteTie);
        Assert.Equal(3, room.GuessesRemaining);
        GameRules.Guess(room, room.HostId, "Hill");
        Assert.Equal(GamePhase.Guessing, room.Phase);
        Assert.Null(GameRules.ToView(room, room.HostId, Now).RevealedWord);
        GameRules.Guess(room, room.HostId, "Valley");
        Assert.Equal(GamePhase.Guessing, room.Phase);
        GameRules.Guess(room, room.HostId, "Lake");
        Assert.Equal(GamePhase.Finished, room.Phase);
        Assert.Equal("Crew", room.WinningTeam);
        Assert.Equal(0, room.GuessesRemaining);
    }

    [Fact]
    public void MultipleImpostorsShareTheSameThreeAttemptBudget()
    {
        var room = Lobby(4);
        GameRules.UpdateSettings(room, room.HostId, new GameSettings { ImpostorCount = 2, RoundCount = 1 });
        GameRules.Start(room, room.HostId, Pair, Now, [room.Players[0].Id, room.Players[1].Id]);
        GameRules.AdvanceExpiredTurn(room, Now.AddHours(1));
        for (var i = 0; i < room.Players.Count; i++)
            GameRules.Vote(room, room.Players[i].Id, room.Players[(i + 1) % room.Players.Count].Id);
        GameRules.Guess(room, room.Players[0].Id, "Hill");
        GameRules.Guess(room, room.Players[1].Id, "Lake");
        Assert.Equal(1, room.GuessesRemaining);
        GameRules.Guess(room, room.Players[0].Id, "Volcano");
        Assert.Equal("Impostors", room.WinningTeam);
    }

    [Fact]
    public void PlayerViewsKeepTokensCommonWordAndOtherRolesOffImpostorWirePayload()
    {
        var room = Started();
        var impostorView = GameRules.ToView(room, room.HostId, Now);
        Assert.True(impostorView.Self.IsImpostor);
        Assert.Equal("Mountain", impostorView.Self.Word);
        Assert.Null(impostorView.RevealedWord);
        Assert.All(impostorView.Players, player => Assert.Null(player.IsImpostor));
        var json = JsonSerializer.Serialize(impostorView, new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            Converters = { new JsonStringEnumConverter() }
        });
        Assert.DoesNotContain("Volcano", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", json, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("\"phase\":\"Playing\"", json);
        var regularView = GameRules.ToView(room, room.Players[1].Id, Now);
        Assert.False(regularView.Self.IsImpostor);
        Assert.Equal("Volcano", regularView.Self.Word);
        Assert.Throws<GameRuleException>(() => GameRules.ToView(room, Guid.NewGuid(), Now));
    }

    [Fact]
    public void SnapshotAndStoredSettingsAreIndependentOfLaterMutations()
    {
        var room = Lobby();
        var settings = new GameSettings { RoundCount = 2 };
        GameRules.UpdateSettings(room, room.HostId, settings);
        settings.RoundCount = 10;
        Assert.Equal(2, room.Settings.RoundCount);
        var snapshot = GameRules.ToView(room, room.HostId, Now);
        GameRules.UpdateSettings(room, room.HostId, new GameSettings { RoundCount = 5 });
        GameRules.Join(room, Player("Later player"));
        Assert.Equal(2, snapshot.Settings.RoundCount);
        Assert.Equal(3, snapshot.Players.Count);
        Assert.Null(snapshot.Self.Word);
    }

    [Fact]
    public void PersistedAggregateRoundTripPreservesPrivateStateAndCanContinueTheGame()
    {
        var original = Guessing(tie: true);
        GameRules.Guess(original, original.HostId, "Hill");
        original.Version = 17;
        var persisted = JsonSerializer.Serialize(original);
        var restored = Assert.IsType<GameRoom>(JsonSerializer.Deserialize<GameRoom>(persisted));
        Assert.Equal(original.Code, restored.Code);
        Assert.Equal(original.HostId, restored.HostId);
        Assert.Equal(17, restored.Version);
        Assert.Equal(3, restored.Votes.Count);
        Assert.Single(restored.Guesses);
        Assert.Equal(2, restored.GuessesRemaining);
        Assert.Equal("secret-token-hash", restored.Players[0].TokenHash);
        GameRules.Guess(restored, restored.HostId, "Volcano");
        Assert.Equal(GamePhase.Finished, restored.Phase);
        Assert.Equal("Impostors", restored.WinningTeam);
    }

    [Fact]
    public void RestartClearsSecretsAndVotesAndPreservesLobbyAndSettings()
    {
        var room = Guessing(tie: false);
        GameRules.Guess(room, room.HostId, "Volcano");
        Assert.All(GameRules.ToView(room, room.HostId, Now).Players, player => Assert.NotNull(player.IsImpostor));
        Assert.Throws<GameRuleException>(() => GameRules.Restart(room, room.Players[1].Id));
        GameRules.Restart(room, room.HostId);
        Assert.Equal("ABCDE", room.Code);
        Assert.Equal(3, room.Players.Count);
        Assert.Equal(1, room.Settings.RoundCount);
        Assert.Equal(GamePhase.Lobby, room.Phase);
        Assert.Null(room.CommonWord);
        Assert.Null(room.HintWord);
        Assert.Empty(room.Votes);
        Assert.Empty(room.Guesses);
        Assert.Null(room.WinningTeam);
        Assert.Null(GameRules.ToView(room, room.HostId, Now).Self.IsImpostor);
        Assert.Null(GameRules.ToView(room, room.HostId, Now).Self.Word);
    }

    private static GamePlayer Player(string nickname) => new()
    {
        Id = Guid.NewGuid(), Nickname = nickname, TokenHash = "secret-token-hash"
    };

    private static GameRoom Lobby(int players = 3)
    {
        var room = GameRules.Create("ABCDE", Player("Player 1"));
        for (var i = 2; i <= players; i++)
            GameRules.Join(room, Player($"Player {i}"));
        return room;
    }

    private static GameRoom Started(int rounds = 1)
    {
        var room = Lobby();
        GameRules.UpdateSettings(room, room.HostId, new GameSettings { RoundCount = rounds });
        GameRules.Start(room, room.HostId, Pair, Now, [room.HostId]);
        return room;
    }

    private static GameRoom Voting()
    {
        var room = Started();
        GameRules.AdvanceExpiredTurn(room, Now.AddHours(1));
        return room;
    }

    private static GameRoom Guessing(bool tie)
    {
        var room = Voting();
        GameRules.Vote(room, room.Players[0].Id, room.Players[1].Id);
        GameRules.Vote(room, room.Players[1].Id, tie ? room.Players[2].Id : room.Players[0].Id);
        GameRules.Vote(room, room.Players[2].Id, room.Players[0].Id);
        return room;
    }
}
