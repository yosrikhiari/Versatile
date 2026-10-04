using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Versatile.Application.Common;

namespace Versatile.Api.Common;

public class CacheResultFilter : IAsyncActionFilter
{
    private readonly ICacheService _cache;

    public CacheResultFilter(ICacheService cache) => _cache = cache;

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var http = context.HttpContext;

        // A successful write makes every cached read of its scope stale. Keys
        // carry a generation per scope (the org, or the user when there is
        // none); bumping it orphans the old entries, which then expire on
        // their own. Without this a write was invisible to GETs for up to the
        // cache duration, so a second device pulling after a push got old rows.
        if (!HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method))
        {
            var done = await next();
            if (done.Exception is null && IsSuccess(done.Result, http))
                await _cache.SetAsync(GenerationKey(http), Guid.NewGuid().ToString("N"), GenerationLifetime);
            return;
        }

        var cacheable = (context.ActionDescriptor as ControllerActionDescriptor)
            ?.MethodInfo.GetCustomAttributes(typeof(CacheableAttribute), false)
            .Cast<CacheableAttribute>()
            .FirstOrDefault();

        if (cacheable is null)
        {
            await next();
            return;
        }

        var generation = await _cache.GetAsync<string>(GenerationKey(http)) ?? "0";
        var cacheKey = BuildKey(http, generation);
        var cached = await _cache.GetAsync<object>(cacheKey);

        if (cached is not null)
        {
            context.Result = new ObjectResult(cached) { StatusCode = 200 };
            return;
        }

        var executed = await next();

        if (executed.Result is ObjectResult { Value: not null, StatusCode: >= 200 and < 300 } result)
        {
            await _cache.SetAsync(cacheKey, result.Value, TimeSpan.FromSeconds(cacheable.DurationSeconds));
        }
    }

    /// <summary>Outlives every cached entry, so a generation never lapses while entries keyed on it live.</summary>
    private static readonly TimeSpan GenerationLifetime = TimeSpan.FromDays(1);

    private static bool IsSuccess(IActionResult? result, HttpContext http) => result switch
    {
        ObjectResult { StatusCode: int code } => code is >= 200 and < 300,
        StatusCodeResult { StatusCode: var code } => code is >= 200 and < 300,
        ObjectResult => true,
        _ => http.Response.StatusCode is >= 200 and < 300
    };

    private static string GenerationKey(HttpContext http)
    {
        if (http.Items.TryGetValue("OrganizationId", out var orgId) && orgId is Guid id)
            return $"cachegen:org:{id}";
        var userId = http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return $"cachegen:user:{userId ?? "anonymous"}";
    }

    private static string BuildKey(HttpContext httpContext, string generation)
    {
        var parts = new List<string>
        {
            httpContext.Request.Method,
            httpContext.Request.Path.Value?.ToLowerInvariant() ?? "",
            $"gen:{generation}",
        };

        if (httpContext.Request.QueryString.HasValue)
        {
            var sorted = httpContext.Request.Query
                .OrderBy(kvp => kvp.Key)
                .Select(kvp => $"{kvp.Key}={kvp.Value}");
            parts.Add(string.Join("&", sorted));
        }

        if (httpContext.Items.TryGetValue("OrganizationId", out var orgId) && orgId is Guid id)
            parts.Add($"org:{id}");

        // Per-user responses must never be shared org-wide: scope the key.
        var userId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!string.IsNullOrEmpty(userId))
            parts.Add($"user:{userId}");

        var raw = string.Join("|", parts);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return $"cache:{Convert.ToHexStringLower(hash)}";
    }
}
