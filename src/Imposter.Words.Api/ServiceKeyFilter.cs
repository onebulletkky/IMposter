using System.Security.Cryptography;
using System.Text;

namespace Imposter.Words.Api;

public sealed class ServiceKeyGuard(string key)
{
    private readonly byte[] expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(key));

    public bool IsValid(string candidate)
    {
        var candidateHash = SHA256.HashData(Encoding.UTF8.GetBytes(candidate));
        return CryptographicOperations.FixedTimeEquals(expectedHash, candidateHash);
    }
}

public sealed class ServiceKeyFilter(ServiceKeyGuard guard) : IEndpointFilter
{
    public ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var supplied = context.HttpContext.Request.Headers["X-Service-Key"];
        if (supplied.Count != 1 || string.IsNullOrEmpty(supplied[0]) || supplied[0]!.Length > 512 || !guard.IsValid(supplied[0]!))
        {
            return ValueTask.FromResult<object?>(Results.Unauthorized());
        }

        return next(context);
    }
}
