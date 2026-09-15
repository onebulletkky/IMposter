using Imposter.Game.Domain;

namespace Imposter.Game.Api.Infrastructure;

public sealed class WordClient(HttpClient client)
{
    public async Task<WordPair> Random(CancellationToken ct)
    {
        try
        {
            using var response = await client.GetAsync("/internal/words/random", ct);
            if (!response.IsSuccessStatusCode)
                throw new ApiException(503, "The word catalog is unavailable or empty. Add words before starting a game.");
            var pair = await response.Content.ReadFromJsonAsync<WordPair>(ct);
            if (pair is null || string.IsNullOrWhiteSpace(pair.Word) || string.IsNullOrWhiteSpace(pair.Hint))
                throw new ApiException(503, "The word catalog returned an invalid word pair.");
            return pair;
        }
        catch (HttpRequestException)
        {
            throw new ApiException(503, "The word service is unavailable. Please try again shortly.");
        }
        catch (System.Text.Json.JsonException)
        {
            throw new ApiException(503, "The word catalog returned an invalid response.");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ApiException(503, "The word service timed out. Please try again shortly.");
        }
    }
}
