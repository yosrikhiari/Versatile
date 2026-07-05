using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenAI.Chat;
using System.ClientModel;
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
        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection")));

        services.AddScoped<DbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped(typeof(IUserOwnedRepository<>), typeof(UserOwnedRepository<>));

        RegisterServicesByConvention(services);

        services.AddScoped<IChatStreamer, ChatClientStreamer>();

        services.AddTransient(sp =>
        {
            var apiKey = configuration["OpenAI:ApiKey"] ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY")
                ?? throw new InvalidOperationException("OpenAI:ApiKey is not configured.");
            var model = configuration["OpenAI:Model"] ?? "gpt-4o-mini";
            return new ChatClient(model, new ApiKeyCredential(apiKey));
        });

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
