namespace Versatile.Application.Services;

public interface IChatProviderFactory
{
    Task<IChatProvider> CreateAsync(string provider, string userId);
}
