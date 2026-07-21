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
        var cacheable = (context.ActionDescriptor as ControllerActionDescriptor)
            ?.MethodInfo.GetCustomAttributes(typeof(CacheableAttribute), false)
            .Cast<CacheableAttribute>()
            .FirstOrDefault();

        if (cacheable is null)
        {
            await next();
            return;
        }

        var cacheKey = BuildKey(context.HttpContext);
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

    private static string BuildKey(HttpContext httpContext)
    {
        var parts = new List<string>
        {
            httpContext.Request.Method,
            httpContext.Request.Path.Value?.ToLowerInvariant() ?? "",
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

        var raw = string.Join("|", parts);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return $"cache:{Convert.ToHexStringLower(hash)}";
    }
}
