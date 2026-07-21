using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Versatile.Application.Services;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Services;

public sealed class AiProviderFactory : IChatProviderFactory
{
    private readonly IServiceProvider _serviceProvider;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;

    private const string OpenAiBase = "https://api.openai.com/v1";
    private const string AnthropicBase = "https://api.anthropic.com/v1";
    private const string GeminiBase = "https://generativelanguage.googleapis.com/v1beta/models/";
    private const string GroqBase = "https://api.groq.com/openai/v1";

    public AiProviderFactory(IServiceProvider serviceProvider, IConfiguration configuration, IHttpClientFactory httpClientFactory)
    {
        _serviceProvider = serviceProvider;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
    }

    public async Task<IChatProvider> CreateAsync(string provider, string userId)
    {
        var key = await GetApiKeyAsync(provider, userId);

        var http = _httpClientFactory.CreateClient("AiProvider");

        switch (provider.ToLowerInvariant())
        {
            case "openai":
                http.BaseAddress = new Uri(OpenAiBase);
                return new OpenAiChatProvider(http, key ?? throw new InvalidOperationException("OpenAI API key not configured"));

            case "anthropic":
                http.BaseAddress = new Uri(AnthropicBase);
                return new AnthropicChatProvider(http, key ?? throw new InvalidOperationException("Anthropic API key not configured"));

            case "gemini":
                http.BaseAddress = new Uri(GeminiBase);
                return new GeminiChatProvider(http, key ?? throw new InvalidOperationException("Gemini API key not configured"));

            case "groq":
                http.BaseAddress = new Uri(GroqBase);
                return new GroqChatProvider(http, key ?? throw new InvalidOperationException("Groq API key not configured"));

            case "ollama":
                var ollamaUrl = _configuration["Ai:Ollama:BaseUrl"] ?? "http://localhost:11434";
                http.BaseAddress = new Uri(ollamaUrl);
                return new OllamaChatProvider(http);

            default:
                throw new ArgumentException($"Unknown provider: {provider}", nameof(provider));
        }
    }

    private async Task<string?> GetApiKeyAsync(string provider, string userId)
    {
        if (provider.Equals("ollama", StringComparison.OrdinalIgnoreCase))
            return null;

        if (!Guid.TryParse(userId, out var guid))
            return null;

        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var keysService = scope.ServiceProvider.GetRequiredService<KeyManagementService>();

        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == guid);
        if (user?.ApiKeysEncrypted == null || user.ApiKeysNonce == null)
            return null;

        var json = keysService.Decrypt(user.ApiKeysEncrypted, user.ApiKeysNonce);
        var keys = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
        return keys?.GetValueOrDefault(provider);
    }
}
