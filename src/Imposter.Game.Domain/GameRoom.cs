namespace Imposter.Game.Domain;

public enum GamePhase
{
    Lobby,
    Playing,
    Voting,
    Guessing,
    Finished
}

public sealed class GameSettings
{
    public int ImpostorCount { get; set; } = 1;
    public int ExtraImpostorChancePercent { get; set; }
    public int RoundCount { get; set; } = 3;
    public int TurnSeconds { get; set; } = 30;
}

public sealed class GamePlayer
{
    public Guid Id { get; set; }
    public string Nickname { get; set; } = "";
    public string TokenHash { get; set; } = "";
    public bool IsImpostor { get; set; }
}

public sealed class GameRoom
{
    public string Code { get; set; } = "";
    public Guid HostId { get; set; }
    public GamePhase Phase { get; set; } = GamePhase.Lobby;
    public GameSettings Settings { get; set; } = new();
    public List<GamePlayer> Players { get; set; } = [];
    public int RoundNumber { get; set; }
    public int TurnNumber { get; set; }
    public int CurrentTurnIndex { get; set; }
    public DateTimeOffset? TurnEndsAt { get; set; }
    public string? CommonWord { get; set; }
    public string? HintWord { get; set; }
    public Dictionary<Guid, Guid> Votes { get; set; } = [];
    public bool IsVoteTie { get; set; }
    public int GuessesRemaining { get; set; }
    public List<GameGuess> Guesses { get; set; } = [];
    public string? WinningTeam { get; set; }
    public long Version { get; set; }
}

public sealed record WordPair(string Word, string Hint);
public sealed record GameGuess(Guid PlayerId, string Word, bool IsCorrect);
public sealed class GameRuleException(string message) : Exception(message);

public sealed record GamePlayerView(
    Guid Id,
    string Nickname,
    bool IsHost,
    bool HasVoted,
    bool? IsImpostor,
    int? VoteCount);

public sealed record GameSelfView(Guid Id, bool? IsImpostor, string? Word, bool HasVoted);

public sealed record GameView(
    string Code,
    Guid HostId,
    GamePhase Phase,
    GameSettings Settings,
    IReadOnlyList<GamePlayerView> Players,
    GameSelfView Self,
    int RoundNumber,
    int TurnNumber,
    Guid? CurrentPlayerId,
    DateTimeOffset? TurnEndsAt,
    DateTimeOffset ServerTime,
    int VotesCast,
    bool IsVoteTie,
    int GuessesRemaining,
    IReadOnlyList<GameGuess> Guesses,
    string? RevealedWord,
    string? WinningTeam,
    long Version);
