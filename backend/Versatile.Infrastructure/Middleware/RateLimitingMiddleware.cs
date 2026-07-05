using System.Collections.Concurrent;
using System.Net;
using Microsoft.AspNetCore.Http;

namespace Versatile.Infrastructure.Middleware;

public class RateLimitingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ConcurrentDictionary<string, RateLimitEntry> _clients = new();
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    private const int MaxRequests = 50;

    public RateLimitingMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Path.StartsWithSegments("/hub"))
        {
            await _next(context);
            return;
        }

        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var entry = _clients.GetOrAdd(ip, _ => new RateLimitEntry());

        lock (entry)
        {
            if (entry.ResetTime < DateTime.UtcNow)
            {
                entry.Count = 0;
                entry.ResetTime = DateTime.UtcNow.Add(Window);
            }

            entry.Count++;

            if (entry.Count > MaxRequests)
            {
                context.Response.StatusCode = (int)HttpStatusCode.TooManyRequests;
                context.Response.Headers["Retry-After"] = entry.ResetTime.Subtract(DateTime.UtcNow).Seconds.ToString();
                return;
            }
        }

        await _next(context);
    }

    private class RateLimitEntry
    {
        public int Count { get; set; }
        public DateTime ResetTime { get; set; } = DateTime.UtcNow.Add(Window);
    }
}
