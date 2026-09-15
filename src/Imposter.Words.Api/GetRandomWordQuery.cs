using MediatR;

namespace Imposter.Words.Api;

public sealed record WordPair(string Word, string Hint);

public sealed record GetRandomWordQuery : IRequest<WordPair?>;

public sealed class GetRandomWordHandler(WordRepository words) : IRequestHandler<GetRandomWordQuery, WordPair?>
{
    public Task<WordPair?> Handle(GetRandomWordQuery request, CancellationToken cancellationToken) =>
        words.GetRandomAsync(cancellationToken);
}
