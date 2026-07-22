using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenAI.Chat;
using Versatile.Application.Common;
using Versatile.Application.Services;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.BackgroundJobs;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;
using Versatile.Infrastructure.Resilience;
using Versatile.Infrastructure.Services;

namespace Versatile.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<TenantSessionInterceptor>();
        services.AddScoped<AuditSaveChangesInterceptor>();

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured");

        services.AddDbContext<ApplicationDbContext>((sp, options) =>
        {
            var tenantInterceptor = sp.GetRequiredService<TenantSessionInterceptor>();
            var auditInterceptor = sp.GetRequiredService<AuditSaveChangesInterceptor>();
            options.UseNpgsql(connectionString, npgsql =>
                    npgsql.EnableRetryOnFailure(3, TimeSpan.FromSeconds(2), null)
                           .MigrationsAssembly(typeof(DependencyInjection).Assembly.FullName))
                   .AddInterceptors(tenantInterceptor, auditInterceptor);
        }, ServiceLifetime.Scoped, ServiceLifetime.Scoped);

        services.AddScoped<DbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped(typeof(IUserOwnedRepository<>), typeof(UserOwnedRepository<>));
        services.AddScoped(typeof(IOrganizationOwnedRepository<>), typeof(OrganizationOwnedRepository<>));
        services.AddScoped<IOrganizationRepository, OrganizationRepository>();
        services.AddScoped<IOrganizationContext>(_ => new OrganizationContext());

        services.AddScoped<IGeneratedStoryService, GeneratedStoryService>();

        services.AddMediatR(cfg =>
            cfg.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly));

        var openAiKey = configuration["Ai:OpenAi:ApiKey"] ?? "";
        if (string.IsNullOrEmpty(openAiKey))
            throw new InvalidOperationException("Ai:OpenAi:ApiKey is not configured. Set Ai__OpenAi__ApiKey env var for production.");
        services.AddScoped(_ => new ChatClient("gpt-4o-mini", openAiKey));
        services.AddScoped<IChatStreamer, ChatClientStreamer>();
        services.AddScoped<KeyManagementService>();

        services.AddAiResiliencePipeline();
        services.AddSingleton<IChatProviderFactory, AiProviderFactory>();
        services.AddScoped<TokenGenerator>();

        services.AddHostedService<OutboxProcessor>();

        services.AddStackExchangeRedisCache(options =>
        {
            options.Configuration = configuration.GetConnectionString("Redis");
            options.InstanceName = "Versatile:";
        });
        services.AddSingleton<ICacheService, RedisCacheService>();

        return services;
    }
}
