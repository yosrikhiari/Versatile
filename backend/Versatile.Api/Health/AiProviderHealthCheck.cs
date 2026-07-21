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
            var openAiKey = _configuration["Ai:OpenAi:ApiKey"];
            if (string.IsNullOrEmpty(openAiKey))
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
