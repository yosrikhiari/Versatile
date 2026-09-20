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

    // URL CONTRACT (do not break): every BaseAddress ends with '/' and every
    // provider-relative path is a bare suffix (no leading '/', no version prefix).
    // HttpClient merges them by simple concatenation, so neither side can drift
    // into a double-/v1/ URL. The Ollama URL is normalized below for the same reason.
    // Pinned by AiProviderUrlTests — update the tests if you touch these.
    private const string OpenAiBase = "https://api.openai.com/v1/";
    private const string AnthropicBase = "https://api.anthropic.com/v1/";
    private const string GeminiBase = "https://generativelanguage.googleapis.com/v1beta/models/";
    private const string GroqBase = "https://api.groq.com/openai/v1/";
    private const string CloudflareBase = "https://api.cloudflare.com/client/v4/";

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

            case "cloudflare":
                http.BaseAddress = new Uri(CloudflareBase);
                var accountId = _configuration["Ai:Cloudflare:AccountId"];
                if (string.IsNullOrEmpty(accountId))
                    throw new InvalidOperationException("Cloudflare account ID not configured (Ai:Cloudflare:AccountId)");
                return new CloudflareChatProvider(
                    http,
                    key ?? throw new InvalidOperationException("Cloudflare API token not configured"),
                    accountId);

            case "ollama":
                var ollamaUrl = (_configuration["Ai:Ollama:BaseUrl"] ?? "http://localhost:11434").TrimEnd('/') + "/";
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

        // Per-user key first (Settings > AI Providers in the UI, synced to the DB).
        if (Guid.TryParse(userId, out var guid))
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var keysService = scope.ServiceProvider.GetRequiredService<KeyManagementService>();

            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == guid);
            if (user?.ApiKeysEncrypted != null && user.ApiKeysNonce != null)
            {
                var json = keysService.Decrypt(user.ApiKeysEncrypted, user.ApiKeysNonce);
                var keys = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                if (keys?.TryGetValue(provider, out var userKey) == true
                    && !string.IsNullOrEmpty(userKey))
                    return userKey;
            }
        }

        // Env fallback: the .env / compose values for server-side paths where no
        // per-user key exists. Placeholder and empty values count as missing.
        var envKey = provider.ToLowerInvariant() switch
        {
            "openai" => _configuration["Ai:OpenAi:ApiKey"],
            "anthropic" => _configuration["Ai:Anthropic:ApiKey"],
            "gemini" => _configuration["Ai:Gemini:ApiKey"],
            "groq" => _configuration["Ai:Groq:ApiKey"],
            "cloudflare" => _configuration["Ai:Cloudflare:ApiToken"],
            _ => null,
        };
        return IsMissing(envKey) ? null : envKey;
    }

    private static bool IsMissing(string? value) =>
        string.IsNullOrEmpty(value) || value.StartsWith("set-via-env-var-", StringComparison.Ordinal);
}
