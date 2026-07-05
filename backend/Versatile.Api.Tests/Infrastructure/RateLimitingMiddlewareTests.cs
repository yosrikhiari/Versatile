using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Versatile.Infrastructure.Middleware;

namespace Versatile.Api.Tests.Infrastructure;

public class RateLimitingMiddlewareTests
{
    private static (RateLimitingMiddleware, DefaultHttpContext) CreateContext()
    {
        var ctx = new DefaultHttpContext();
        ctx.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("192.168.1.1");
        ctx.Request.Path = "/api/test";
        ctx.Response.Body = new MemoryStream();
        var next = (RequestDelegate)(_ => Task.CompletedTask);
        var middleware = new RateLimitingMiddleware(next);
        return (middleware, ctx);
    }

    [Fact]
    public async Task Allows_Requests_Under_Limit()
    {
        var (middleware, ctx) = CreateContext();

        for (var i = 0; i < 50; i++)
        {
            ctx.Response.StatusCode = 200;
            ctx.Response.Body.SetLength(0);
            await middleware.InvokeAsync(ctx);
            ctx.Response.StatusCode.Should().Be(200, $"request {i + 1} should be allowed");
        }
    }

    [Fact]
    public async Task Blocks_Requests_Over_Limit()
    {
        var (middleware, ctx) = CreateContext();

        for (var i = 0; i < 50; i++)
        {
            ctx.Response.StatusCode = 200;
            ctx.Response.Body.SetLength(0);
            await middleware.InvokeAsync(ctx);
        }

        ctx.Response.StatusCode = 200;
        ctx.Response.Body.SetLength(0);
        await middleware.InvokeAsync(ctx);
        ctx.Response.StatusCode.Should().Be(429);
        ctx.Response.Headers.Should().ContainKey("Retry-After");
    }

    [Fact]
    public async Task Skips_Rate_Limiting_For_Hub_Endpoints()
    {
        var ctx = new DefaultHttpContext();
        ctx.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("192.168.1.2");
        ctx.Request.Path = "/hub/generation";
        ctx.Response.Body = new MemoryStream();

        var next = (RequestDelegate)(_ => Task.CompletedTask);
        var middleware = new RateLimitingMiddleware(next);

        for (var i = 0; i < 100; i++)
        {
            ctx.Response.StatusCode = 200;
            ctx.Response.Body.SetLength(0);
            await middleware.InvokeAsync(ctx);
            ctx.Response.StatusCode.Should().Be(200, $"hub request {i + 1} should be allowed");
        }
    }
}
