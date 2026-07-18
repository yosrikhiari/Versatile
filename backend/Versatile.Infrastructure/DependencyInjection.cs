using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenAI.Chat;
using Versatile.Application.Services;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;
using Versatile.Infrastructure.Services;

namespace Versatile.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<TenantSessionInterceptor>();

        services.AddDbContext<ApplicationDbContext>((sp, options) =>
        {
            var interceptor = sp.GetRequiredService<TenantSessionInterceptor>();
            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection"))
                   .AddInterceptors(interceptor);
        }, ServiceLifetime.Scoped, ServiceLifetime.Scoped);

        services.AddScoped<DbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped(typeof(IUserOwnedRepository<>), typeof(UserOwnedRepository<>));
        services.AddScoped(typeof(IOrganizationOwnedRepository<>), typeof(OrganizationOwnedRepository<>));
        services.AddScoped<IOrganizationContext>(_ => new OrganizationContext());

        RegisterServicesByConvention(services);

        var openAiKey = configuration["Ai:OpenAi:ApiKey"] ?? "sk-placeholder";
        services.AddScoped(_ => new ChatClient("gpt-4o-mini", openAiKey));
        services.AddScoped<IChatStreamer, ChatClientStreamer>();
        services.AddScoped<KeyManagementService>();

        services.AddSingleton<IChatProviderFactory, AiProviderFactory>();

        return services;
    }

    private static void RegisterServicesByConvention(IServiceCollection services)
    {
        var serviceTypes = typeof(DependencyInjection).Assembly.GetExportedTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false, Namespace: "Versatile.Infrastructure.Services" });

        foreach (var type in serviceTypes)
        {
            var interfaceType = type.GetInterfaces().FirstOrDefault(i => i.Name == "I" + type.Name);
            if (interfaceType != null)
                services.AddScoped(interfaceType, type);
        }
    }
}
