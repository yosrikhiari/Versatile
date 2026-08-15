using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Serilog;
using Versatile.Application;
using Versatile.Infrastructure;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Middleware;
using Versatile.Api.Common;
using Versatile.Api.Hubs;
using Versatile.Api.Health;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // ReadFrom.Configuration builds the logger entirely from a "Serilog" config
    // section. No appsettings file defines one, so this replaced the bootstrap
    // logger with a sink-less logger and every line written after Build() — the
    // fatal startup error included — went nowhere. The console sink is applied
    // in code as a floor that configuration cannot silently remove. If a
    // "Serilog" section is ever added with its own Console sink, drop this one
    // or output doubles.
    builder.Host.UseSerilog((ctx, lc) => lc.ReadFrom.Configuration(ctx.Configuration).WriteTo.Console());

    var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured");
    _ = builder.Configuration["Jwt:Issuer"] ?? throw new InvalidOperationException("Jwt:Issuer is not configured");
    _ = builder.Configuration["Jwt:Audience"] ?? throw new InvalidOperationException("Jwt:Audience is not configured");
    _ = builder.Configuration.GetConnectionString("DefaultConnection") ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured");

    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = builder.Configuration["Jwt:Issuer"],
                ValidAudience = builder.Configuration["Jwt:Audience"],
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
            };

            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    var accessToken = context.Request.Query["access_token"];
                    if (!string.IsNullOrEmpty(accessToken))
                        context.Token = accessToken;
                    else if (context.Request.Cookies.TryGetValue("access_token", out var cookieToken))
                        context.Token = cookieToken;
                    return Task.CompletedTask;
                }
            };
        });

    builder.Services.AddAuthorization();

    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
        {
            policy.WithOrigins("http://localhost:5173")
                  .AllowAnyHeader().AllowAnyMethod().AllowCredentials();
        });
    });

    builder.Services.AddSignalR().AddHubOptions<CollaborationHub>(options =>
    {
        options.MaximumReceiveMessageSize = 128 * 1024;
    });

    builder.Services.AddScoped<CacheResultFilter>();
    builder.Services.AddControllers(options =>
    {
        options.Filters.Add<RouteValuesPreservationFilter>();
        options.Filters.Add<ResponseEnvelopeFilter>();
        if (!builder.Environment.IsEnvironment("Testing"))
        {
            options.Filters.Add(new TypeFilterAttribute(typeof(CacheResultFilter)));
            options.Filters.Add<AutoValidateAntiforgeryTokenAttribute>();
        }
    }).AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });
    builder.Services.AddEndpointsApiExplorer();

    builder.Services.AddHttpClient();
    builder.Services.AddHttpContextAccessor();

    builder.Services.AddApplication();

    if (builder.Environment.IsEnvironment("Testing"))
    {
        builder.Services.AddInfrastructure(builder.Configuration, useNpgsql: false);
    }
    else
    {
        builder.Services.AddInfrastructure(builder.Configuration);
    }

    builder.Services.AddAntiforgery(options =>
    {
        options.HeaderName = "X-CSRF-TOKEN";
        options.Cookie.Name = "X-CSRF-TOKEN";
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = builder.Environment.IsEnvironment("Testing") ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Strict;
    });

    builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
    builder.Services.AddProblemDetails();

    builder.Services.AddHealthChecks()
        .AddCheck<AiProviderHealthCheck>("ai_provider")
        .AddDbContextCheck<Versatile.Infrastructure.Data.ApplicationDbContext>("database");

    builder.Services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new()
        {
            Title = "Versatile API",
            Version = "v1",
            Description = "Fiction writing assistant API"
        });
        options.AddSecurityDefinition("Bearer", new()
        {
            Name = "Authorization",
            Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = Microsoft.OpenApi.Models.ParameterLocation.Header,
            Description = "Enter your JWT token"
        });
        options.AddSecurityRequirement(new()
        {
            {
                new() { Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } },
                Array.Empty<string>()
            }
        });
    });

    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
            RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                factory: _ => new()
                {
                    AutoReplenishment = true,
                    PermitLimit = 100,
                    Window = TimeSpan.FromMinutes(1)
                }));
    });

    builder.Services.AddOpenTelemetry()
        .WithTracing(tracing => tracing
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddOtlpExporter())
        .WithMetrics(metrics => metrics
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddConsoleExporter());

    var app = builder.Build();

    // Deliberately after Build(): a host wrapper (WebApplicationFactory in the
    // integration tests) contributes both its configuration sources and its
    // environment name during Build, not before it. Checking against `builder`
    // reads appsettings.json's placeholders under environment "Production" and
    // rejects a correctly-configured test host.
    RequireStrongSecret(app.Configuration, app.Environment, "Jwt:Key");
    RequireStrongSecret(app.Configuration, app.Environment, "Encryption:MasterKey");

    app.UseSerilogRequestLogging();

    app.UseExceptionHandler();
    app.UseMiddleware<CorrelationIdMiddleware>();
    app.UseMiddleware<InputSanitizationMiddleware>();

    app.UseRateLimiter();

    app.UseCors();
    app.UseAuthentication();
    app.UseAuthorization();
    app.UseAntiforgery();
    app.UseMiddleware<TenantResolutionMiddleware>();

    app.MapControllers();

    app.MapHealthChecks("/health", new()
    {
        ResponseWriter = async (ctx, report) =>
        {
            ctx.Response.ContentType = "application/json";
            var response = new
            {
                status = report.Status.ToString(),
                checks = report.Entries.Select(e => new
                {
                    name = e.Key,
                    status = e.Value.Status.ToString(),
                    description = e.Value.Description
                })
            };
            await System.Text.Json.JsonSerializer.SerializeAsync(ctx.Response.Body, response);
        }
    });

    if (app.Environment.IsDevelopment())
    {
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            ApplicationDbContext.EnsureTenantSafety();
            await db.Database.MigrateAsync();
            await EnsureSeedDataAsync(db);
        }

        app.UseSwagger();
        app.UseSwaggerUI(options =>
        {
            options.SwaggerEndpoint("/swagger/v1/swagger.json", "Versatile API v1");
            options.RoutePrefix = "swagger";
        });
    }

    app.MapHub<CollaborationHub>("/hubs/collaboration");
    app.MapHub<GenerationHub>("/hubs/generation");

    app.Run();
}
// Host-control exceptions are not application failures: WebApplicationFactory
// stops the host mid-build with an internal sentinel, and `dotnet ef` aborts it
// with HostAbortedException. Swallowing either turns a deliberate stop into a
// "terminated unexpectedly" log line and hands the caller a host that never
// started, so let them through.
catch (Exception ex) when (ex is not HostAbortedException
                           && ex.GetType().Name != "StopTheHostException")
{
    Log.Fatal(ex, "Application terminated unexpectedly");
    // Without this the process exits 0 after a fatal startup failure, so Docker,
    // systemd and Kubernetes all read a crashed boot as a clean shutdown and
    // neither restart nor alert on it.
    Environment.ExitCode = 1;
}
finally
{
    Log.CloseAndFlush();
}

/// <summary>
/// appsettings.json ships placeholder values for the signing and encryption keys
/// so that a fresh clone runs without setup. The cost is that a plain null check
/// can never fire in a real deployment: forget to set Jwt__Key and the app boots
/// happily, signing tokens with a key that is public in this repository — anyone
/// can then mint a token for any user or organisation. Outside Development the
/// placeholders, and anything too short to be a credible HMAC key, are rejected
/// so a misconfigured deploy fails loudly at startup instead of quietly running
/// insecure.
/// </summary>
static string RequireStrongSecret(IConfiguration configuration, IHostEnvironment environment, string key)
{
    var value = configuration[key];
    if (string.IsNullOrWhiteSpace(value))
        throw new InvalidOperationException($"{key} is not configured.");

    // Development keeps the convenience of the checked-in placeholders.
    if (environment.IsDevelopment())
        return value;

    var envVar = key.Replace(":", "__");
    if (value.Contains("CHANGE-ME", StringComparison.OrdinalIgnoreCase) ||
        value.StartsWith("set-via-env-var", StringComparison.OrdinalIgnoreCase))
    {
        throw new InvalidOperationException(
            $"{key} is still the placeholder from appsettings.json. Set the {envVar} environment variable.");
    }

    const int minimumLength = 32;
    if (value.Length < minimumLength)
    {
        throw new InvalidOperationException(
            $"{key} must be at least {minimumLength} characters outside Development (got {value.Length}). Set the {envVar} environment variable.");
    }

    return value;
}

static async Task EnsureSeedDataAsync(ApplicationDbContext db)
{
    if (await db.Database.CanConnectAsync() && !await db.Organizations.AnyAsync())
    {
        db.Organizations.Add(new()
        {
            Id = Guid.Parse("00000000-0000-0000-0000-000000000001"),
            Name = "Default Organization",
            Slug = "default",
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
    }
}

public partial class Program { }
