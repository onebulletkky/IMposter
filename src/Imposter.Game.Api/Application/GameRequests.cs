using Imposter.Game.Api.Infrastructure;
using Imposter.Game.Domain;
using MediatR;
using Npgsql;

namespace Imposter.Game.Api.Application;

public sealed record SessionResponse(string Code, Guid PlayerId, string Token, GameView View);
public sealed record CreateLobby(string Nickname) : IRequest<SessionResponse>;
public sealed record JoinLobby(string Code, string Nickname) : IRequest<SessionResponse>;
public enum RoomAction { Read, Settings, Start, ConfirmTurn, Vote, Guess, Restart, Leave }
public sealed record RoomRequest(string Code, string Token, RoomAction Action,
    GameSettings? Settings = null, int TurnNumber = 0, Guid TargetId = default, string? Word = null) : IRequest<GameView?>;

public sealed class CreateLobbyHandler(GameStore store, TimeProvider clock) : IRequestHandler<CreateLobby, SessionResponse>
{
    public async Task<SessionResponse> Handle(CreateLobby request, CancellationToken ct)
    {
        var token = GameStore.NewToken();
        var player = new GamePlayer { Id = Guid.NewGuid(), Nickname = request.Nickname, TokenHash = GameStore.HashToken(token) };
        for (var attempt = 0; attempt < 10; attempt++)
        {
            var room = GameRules.Create(GameStore.NewCode(), player);
            room.Version = 1;
            try
            {
                await store.Insert(room, ct);
                return new(room.Code, player.Id, token, GameRules.ToView(room, player.Id, clock.GetUtcNow()));
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { }
        }
        throw new ApiException(503, "Could not allocate a lobby code. Please try again.");
    }
}

public sealed class JoinLobbyHandler(GameStore store) : IRequestHandler<JoinLobby, SessionResponse>
{
    public Task<SessionResponse> Handle(JoinLobby request, CancellationToken ct)
        => store.WithRoom(request.Code, (room, now) =>
        {
            var token = GameStore.NewToken();
            var player = new GamePlayer { Id = Guid.NewGuid(), Nickname = request.Nickname, TokenHash = GameStore.HashToken(token) };
            GameRules.Join(room, player);
            room.Version++;
            return new SessionResponse(room.Code, player.Id, token, GameRules.ToView(room, player.Id, now));
        }, ct);
}

public sealed class RoomRequestHandler(GameStore store, WordClient words) : IRequestHandler<RoomRequest, GameView?>
{
    public Task<GameView?> Handle(RoomRequest request, CancellationToken ct)
        => store.WithRoom<GameView?>(request.Code, async (room, now) =>
        {
            var playerId = GameStore.Authenticate(room, request.Token);
            if (GameRules.AdvanceExpiredTurn(room, now)) room.Version++;
            switch (request.Action)
            {
                case RoomAction.Read: break;
                case RoomAction.Settings:
                    GameRules.UpdateSettings(room, playerId, request.Settings ?? throw new ApiException(400, "Settings are required."));
                    break;
                case RoomAction.Start:
                    if (room.HostId != playerId || room.Phase != GamePhase.Lobby)
                        throw new ApiException(409, "Only the host can start a waiting lobby.");
                    GameRules.Start(room, playerId, await words.Random(ct), now);
                    break;
                case RoomAction.ConfirmTurn: GameRules.ConfirmTurn(room, playerId, request.TurnNumber, now); break;
                case RoomAction.Vote: GameRules.Vote(room, playerId, request.TargetId); break;
                case RoomAction.Guess: GameRules.Guess(room, playerId, request.Word ?? ""); break;
                case RoomAction.Restart: GameRules.Restart(room, playerId); break;
                case RoomAction.Leave: GameRules.Leave(room, playerId); break;
                default: throw new ApiException(400, "Unknown game action.");
            }
            if (request.Action != RoomAction.Read) room.Version++;
            return request.Action == RoomAction.Leave ? null : GameRules.ToView(room, playerId, now);
        }, ct);
}
