using Microsoft.Extensions.Diagnostics.HealthChecks;
using Versatile.Application.Services;

namespace Versatile.Api.Health;

public class AiProviderHealthCheck : IHealthCheck
{
    private readonly IChatProviderFactory _factory;
    private readonly IConfiguration _configuration;

    public AiProviderHealthCheck(IChatProviderFactory factory, IConfiguration configuration)
    {
        _factory = factory;
        _configuration = configuration;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken ct)
    {
        try
        {
            // Healthy when ANY provider key is present — local Ollama needs none,
            // and a Gemini/Groq/Cloudflare-only setup is a valid configuration.
            var candidates = new[]
            {
                _configuration["Ai:OpenAi:ApiKey"],
                _configuration["Ai:Anthropic:ApiKey"],
                _configuration["Ai:Gemini:ApiKey"],
                _configuration["Ai:Groq:ApiKey"],
                _configuration["Ai:MistralKey"],
                _configuration["Ai:Cloudflare:ApiToken"],
            };
            if (candidates.All(string.IsNullOrEmpty))
                return HealthCheckResult.Degraded("No AI provider API key configured");

            var factoryResolved = _factory is not null;
            return factoryResolved
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Degraded("AI provider factory not resolved");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("AI provider check failed", ex);
        }
    }
}
