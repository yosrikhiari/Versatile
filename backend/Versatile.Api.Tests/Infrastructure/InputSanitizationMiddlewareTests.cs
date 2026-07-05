using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Versatile.Infrastructure.Middleware;

namespace Versatile.Api.Tests.Infrastructure;

public class InputSanitizationMiddlewareTests
{
    private static (InputSanitizationMiddleware, DefaultHttpContext) CreateContext(
        string method = "POST", string body = "", string queryString = "")
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Method = method;
        ctx.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(body));
        ctx.Request.Body.Seek(0, SeekOrigin.Begin);
        ctx.Response.Body = new MemoryStream();

        if (!string.IsNullOrEmpty(queryString))
        {
            ctx.Request.QueryString = new QueryString($"?{queryString}");
        }

        var next = (RequestDelegate)(_ => Task.CompletedTask);
        var middleware = new InputSanitizationMiddleware(next);
        return (middleware, ctx);
    }

    [Fact]
    public async Task Allows_Safe_Body()
    {
        var (middleware, ctx) = CreateContext("POST", "{\"title\":\"Hello World\"}");
        await middleware.InvokeAsync(ctx);
        ctx.Response.StatusCode.Should().Be(200);
    }

    [Fact]
    public async Task Blocks_Script_Tag_In_Body()
    {
        var (middleware, ctx) = CreateContext("POST", "{\"input\":\"<script>alert(1)</script>\"}");
        await middleware.InvokeAsync(ctx);
        ctx.Response.StatusCode.Should().Be(400);
    }

    [Fact]
    public async Task Blocks_JavaScript_Protocol()
    {
        var (middleware, ctx) = CreateContext("POST", "{\"url\":\"javascript:alert(1)\"}");
        await middleware.InvokeAsync(ctx);
        ctx.Response.StatusCode.Should().Be(400);
    }

    [Fact]
    public async Task Blocks_Event_Handler_In_Body()
    {
        var (middleware, ctx) = CreateContext("POST", "<img src=x onerror=alert(1)>");
        await middleware.InvokeAsync(ctx);
        ctx.Response.StatusCode.Should().Be(400);
    }

    [Fact]
    public async Task Blocks_Xss_In_QueryString()
    {
        var (middleware, ctx) = CreateContext("GET", "", "q=<script>alert(1)</script>");
        await middleware.InvokeAsync(ctx);
        ctx.Response.StatusCode.Should().Be(400);
    }

    [Fact]
    public async Task Allows_Safe_QueryString()
    {
        var (middleware, ctx) = CreateContext("GET", "", "q=hello+world");
        await middleware.InvokeAsync(ctx);
        ctx.Response.StatusCode.Should().Be(200);
    }

    [Fact]
    public async Task Skips_Non_Mutating_Methods()
    {
        var (middleware, ctx) = CreateContext("GET", "<script>alert(1)</script>");
        ctx.Request.Body.SetLength(0);
        await middleware.InvokeAsync(ctx);
        ctx.Response.StatusCode.Should().Be(200);
    }
}
