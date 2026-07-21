using Microsoft.Extensions.DependencyInjection;
using Polly;

namespace Versatile.Infrastructure.Resilience;

public static class ResilienceConfiguration
{
    public static IServiceCollection AddAiResiliencePipeline(this IServiceCollection services)
    {
        services.AddHttpClient("AiProvider")
            .AddResilienceHandler("ai-pipeline", builder =>
            {
                builder.AddRetry(new()
                {
                    MaxRetryAttempts = 3,
                    Delay = TimeSpan.FromSeconds(2),
                    BackoffType = DelayBackoffType.Exponential,
                    UseJitter = true,
                });

                builder.AddCircuitBreaker(new()
                {
                    BreakDuration = TimeSpan.FromSeconds(30),
                    SamplingDuration = TimeSpan.FromSeconds(60),
                    FailureRatio = 0.2,
                    MinimumThroughput = 5,
                });

                builder.AddTimeout(TimeSpan.FromSeconds(100));
            });

        return services;
    }
}
