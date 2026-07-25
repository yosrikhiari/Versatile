using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Versatile.Application.Common;
using Versatile.Infrastructure.Data;

namespace Versatile.IntegrationTests.Infrastructure;

public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = $"TestDb_{Guid.NewGuid()}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((context, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "test-key-at-least-32-characters-long-for-hmac!!!",
                ["Jwt:Issuer"] = "test-issuer",
                ["Jwt:Audience"] = "test-audience",
                ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=versatile_test;Username=test;Password=test",
                ["Ai:OpenAi:ApiKey"] = "sk-test-fake-key",
                ["ConnectionStrings:Redis"] = "localhost:6379",
                ["Encryption:MasterKey"] = "test-master-key-for-integration-tests-at-least-32-chars!!"
            });
        });

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<ApplicationDbContext>();

            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseInMemoryDatabase(_dbName));

            services.AddAuthentication(TestAuthHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(
                    TestAuthHandler.SchemeName, _ => { });

            services.RemoveAll<ICacheService>();
            services.AddSingleton<ICacheService>(_ => new NoOpCacheService());

            services.PostConfigure<MvcOptions>(options =>
            {
                for (var i = options.Filters.Count - 1; i >= 0; i--)
                {
                    if (options.Filters[i] is FilterItem { Filter: AutoValidateAntiforgeryTokenAttribute })
                        options.Filters.RemoveAt(i);
                }
            });
        });
    }
}
