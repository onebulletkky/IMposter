using Imposter.Game.Domain;

namespace Imposter.Game.Api.Infrastructure;

public sealed class TurnWorker(GameStore store, ILogger<TurnWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                foreach (var code in await store.DueRooms(stoppingToken))
                {
                    try
                    {
                        await store.WithRoom(code, (room, now) =>
                        {
                            if (GameRules.AdvanceExpiredTurn(room, now)) room.Version++;
                            return true;
                        }, stoppingToken);
                    }
                    catch (ApiException e) when (e.StatusCode == 404) { }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception e) { logger.LogError(e, "Unable to advance expired game turns."); }
        }
    }
}
