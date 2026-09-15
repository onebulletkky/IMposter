using System.Security.Cryptography;
using System.Text;

namespace Imposter.Game.Domain;

public static class GameRules
{
    public const int MinimumPlayers = 3;
    public const int MaximumPlayers = 16;

    public static GameRoom Create(string code, GamePlayer player)
    {
        Require(code is { Length: 5 } && code.All(c => c is >= 'A' and <= 'Z' or >= '0' and <= '9'),
            "Lobby codes must contain five uppercase letters or digits.");
        ValidatePlayer(player);
        player.IsImpostor = false;
        return new GameRoom { Code = code, HostId = player.Id, Players = [player] };
    }

    public static void Join(GameRoom room, GamePlayer player)
    {
        RequirePhase(room, GamePhase.Lobby);
        Require(room.Players.Count < MaximumPlayers, "This lobby is full.");
        ValidatePlayer(player);
        Require(room.Players.All(p => p.Id != player.Id), "You have already joined this lobby.");
        Require(room.Players.All(p => !string.Equals(p.Nickname, player.Nickname, StringComparison.OrdinalIgnoreCase)),
            "That nickname is already in use in this lobby.");
        player.IsImpostor = false;
        room.Players.Add(player);
    }

    public static void UpdateSettings(GameRoom room, Guid actorId, GameSettings settings)
    {
        RequireHost(room, actorId);
        RequirePhase(room, GamePhase.Lobby);
        ValidateSettings(settings);
        room.Settings = CopySettings(settings);
    }

    public static void Start(
        GameRoom room,
        Guid actorId,
        WordPair wordPair,
        DateTimeOffset now,
        IReadOnlyCollection<Guid>? impostorIds = null)
    {
        RequireHost(room, actorId);
        RequirePhase(room, GamePhase.Lobby);
        ValidateSettings(room.Settings);
        Require(room.Players.Count is >= MinimumPlayers and <= MaximumPlayers,
            $"A game needs between {MinimumPlayers} and {MaximumPlayers} players.");
        var maximumImpostors = room.Settings.ImpostorCount + (room.Settings.ExtraImpostorChancePercent > 0 ? 1 : 0);
        Require(maximumImpostors < room.Players.Count,
            "Leave at least one regular player, including when an extra impostor is selected.");
        var word = wordPair.Word?.Trim();
        var hint = wordPair.Hint?.Trim();
        Require(word is { Length: >= 1 and <= 80 }, "A common word of at most 80 characters is required.");
        Require(hint is { Length: >= 1 and <= 160 }, "A hint of at most 160 characters is required.");
        Require(NormalizeWord(word!) != NormalizeWord(hint!), "The hint must differ from the common word.");

        HashSet<Guid> selected;
        if (impostorIds is not null)
        {
            selected = impostorIds.ToHashSet();
            Require(selected.Count == impostorIds.Count && selected.All(id => room.Players.Any(p => p.Id == id)),
                "Every selected impostor must be a different lobby player.");
            var minimumImpostors = room.Settings.ImpostorCount + (room.Settings.ExtraImpostorChancePercent == 100 ? 1 : 0);
            Require(selected.Count >= minimumImpostors && selected.Count <= maximumImpostors,
                "The selected impostors do not match the lobby settings.");
        }
        else
        {
            var count = room.Settings.ImpostorCount;
            if (RandomNumberGenerator.GetInt32(100) < room.Settings.ExtraImpostorChancePercent)
                count++;
            var candidates = room.Players.Select(p => p.Id).ToArray();
            RandomNumberGenerator.Shuffle(candidates.AsSpan());
            selected = candidates.Take(count).ToHashSet();
        }

        foreach (var player in room.Players)
            player.IsImpostor = selected.Contains(player.Id);
        room.CommonWord = word;
        room.HintWord = hint;
        room.Votes.Clear();
        room.Guesses.Clear();
        room.IsVoteTie = false;
        room.GuessesRemaining = 0;
        room.WinningTeam = null;
        room.RoundNumber = 1;
        room.TurnNumber = 1;
        room.CurrentTurnIndex = 0;
        room.TurnEndsAt = now.AddSeconds(room.Settings.TurnSeconds);
        room.Phase = GamePhase.Playing;
    }

    public static void ConfirmTurn(GameRoom room, Guid actorId, int expectedTurnNumber, DateTimeOffset now)
    {
        RequirePlayer(room, actorId);
        RequirePhase(room, GamePhase.Playing);
        Require(room.TurnNumber == expectedTurnNumber, "This turn has already changed. Refresh the game.");
        Require(room.Players[room.CurrentTurnIndex].Id == actorId, "It is another player's turn.");
        Require(now < room.TurnEndsAt, "Your turn has expired.");
        AdvanceTurn(room, now);
    }

    public static bool AdvanceExpiredTurn(GameRoom room, DateTimeOffset now)
    {
        var changed = false;
        while (room.Phase == GamePhase.Playing && room.TurnEndsAt is { } deadline && now >= deadline)
        {
            AdvanceTurn(room, deadline);
            changed = true;
        }
        return changed;
    }

    public static void Vote(GameRoom room, Guid actorId, Guid targetId)
    {
        RequirePlayer(room, actorId);
        RequirePhase(room, GamePhase.Voting);
        RequirePlayer(room, targetId);
        Require(actorId != targetId, "You cannot vote for yourself.");
        Require(!room.Votes.ContainsKey(actorId), "You have already voted.");
        room.Votes.Add(actorId, targetId);
        if (room.Votes.Count < room.Players.Count)
            return;

        var counts = room.Votes.Values.GroupBy(id => id).Select(group => group.Count()).ToArray();
        room.IsVoteTie = counts.Count(count => count == counts.Max()) > 1;
        room.GuessesRemaining = room.IsVoteTie ? 3 : 1;
        room.Phase = GamePhase.Guessing;
    }

    public static void Guess(GameRoom room, Guid actorId, string word)
    {
        var actor = RequirePlayer(room, actorId);
        RequirePhase(room, GamePhase.Guessing);
        Require(actor.IsImpostor, "Only impostors can guess the common word.");
        var guess = word?.Trim();
        Require(guess is { Length: >= 1 and <= 80 }, "Enter a guess between 1 and 80 characters.");
        var isCorrect = NormalizeWord(guess!) == NormalizeWord(room.CommonWord!);
        room.Guesses.Add(new GameGuess(actorId, guess!, isCorrect));
        room.GuessesRemaining--;
        if (isCorrect || room.GuessesRemaining == 0)
        {
            room.WinningTeam = isCorrect ? "Impostors" : "Crew";
            room.Phase = GamePhase.Finished;
        }
    }

    public static void Restart(GameRoom room, Guid actorId)
    {
        RequireHost(room, actorId);
        RequirePhase(room, GamePhase.Finished);
        foreach (var player in room.Players)
            player.IsImpostor = false;
        room.Phase = GamePhase.Lobby;
        room.CommonWord = null;
        room.HintWord = null;
        room.Votes.Clear();
        room.Guesses.Clear();
        room.IsVoteTie = false;
        room.GuessesRemaining = 0;
        room.WinningTeam = null;
        room.RoundNumber = 0;
        room.TurnNumber = 0;
        room.CurrentTurnIndex = 0;
        room.TurnEndsAt = null;
    }

    public static void Leave(GameRoom room, Guid actorId)
    {
        var actor = RequirePlayer(room, actorId);
        Require(room.Phase is GamePhase.Lobby or GamePhase.Finished, "Players can leave between games.");
        room.Players.Remove(actor);
        if (room.HostId == actorId)
            room.HostId = room.Players.FirstOrDefault()?.Id ?? Guid.Empty;
    }

    public static GameView ToView(GameRoom room, Guid actorId, DateTimeOffset now)
    {
        var self = RequirePlayer(room, actorId);
        var finished = room.Phase == GamePhase.Finished;
        var showCounts = room.Phase is GamePhase.Guessing or GamePhase.Finished;
        var started = room.Phase != GamePhase.Lobby;
        var counts = room.Votes.Values.GroupBy(id => id).ToDictionary(group => group.Key, group => group.Count());
        return new GameView(
            room.Code,
            room.HostId,
            room.Phase,
            CopySettings(room.Settings),
            room.Players.Select(player => new GamePlayerView(
                player.Id,
                player.Nickname,
                player.Id == room.HostId,
                room.Votes.ContainsKey(player.Id),
                finished ? player.IsImpostor : null,
                showCounts ? counts.GetValueOrDefault(player.Id) : null)).ToArray(),
            new GameSelfView(self.Id, started ? self.IsImpostor : null,
                started ? self.IsImpostor ? room.HintWord : room.CommonWord : null,
                room.Votes.ContainsKey(self.Id)),
            room.RoundNumber,
            room.TurnNumber,
            room.Phase == GamePhase.Playing ? room.Players[room.CurrentTurnIndex].Id : null,
            room.TurnEndsAt,
            now,
            room.Votes.Count,
            room.IsVoteTie,
            room.GuessesRemaining,
            room.Guesses.ToArray(),
            finished ? room.CommonWord : null,
            room.WinningTeam,
            room.Version);
    }

    private static void AdvanceTurn(GameRoom room, DateTimeOffset startsAt)
    {
        if (room.CurrentTurnIndex + 1 < room.Players.Count)
            room.CurrentTurnIndex++;
        else if (room.RoundNumber < room.Settings.RoundCount)
        {
            room.CurrentTurnIndex = 0;
            room.RoundNumber++;
        }
        else
        {
            room.Phase = GamePhase.Voting;
            room.TurnEndsAt = null;
            return;
        }
        room.TurnNumber++;
        room.TurnEndsAt = startsAt.AddSeconds(room.Settings.TurnSeconds);
    }

    private static void ValidatePlayer(GamePlayer player)
    {
        Require(player.Id != Guid.Empty, "A player identifier is required.");
        var nickname = player.Nickname?.Trim();
        Require(nickname is { Length: >= 1 and <= 24 }, "Enter a nickname between 1 and 24 characters.");
        Require(!nickname!.Any(char.IsControl), "Nicknames cannot contain control characters.");
        player.Nickname = nickname!;
    }

    private static void ValidateSettings(GameSettings settings)
    {
        Require(settings.ImpostorCount is >= 1 and <= 5, "Choose between 1 and 5 impostors.");
        Require(settings.ExtraImpostorChancePercent is >= 0 and <= 100, "The extra impostor chance must be between 0 and 100 percent.");
        Require(settings.RoundCount is >= 1 and <= 10, "Choose between 1 and 10 rounds.");
        Require(settings.TurnSeconds is >= 10 and <= 180, "Turns must last between 10 and 180 seconds.");
    }

    private static GameSettings CopySettings(GameSettings settings) => new()
    {
        ImpostorCount = settings.ImpostorCount,
        ExtraImpostorChancePercent = settings.ExtraImpostorChancePercent,
        RoundCount = settings.RoundCount,
        TurnSeconds = settings.TurnSeconds
    };

    private static string NormalizeWord(string word) => word.Trim().Normalize(NormalizationForm.FormKC).ToUpperInvariant();

    private static GamePlayer RequirePlayer(GameRoom room, Guid actorId) =>
        room.Players.FirstOrDefault(player => player.Id == actorId) ?? throw new GameRuleException("You are not a player in this lobby.");

    private static void RequireHost(GameRoom room, Guid actorId)
    {
        RequirePlayer(room, actorId);
        Require(room.HostId == actorId, "Only the lobby host can do that.");
    }

    private static void RequirePhase(GameRoom room, GamePhase phase) =>
        Require(room.Phase == phase, $"This action is only available during {phase.ToString().ToLowerInvariant()}.");

    private static void Require(bool condition, string message)
    {
        if (!condition)
            throw new GameRuleException(message);
    }
}
