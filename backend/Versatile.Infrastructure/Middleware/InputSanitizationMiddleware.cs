using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;

namespace Versatile.Infrastructure.Middleware;

public partial class InputSanitizationMiddleware
{
    private readonly RequestDelegate _next;

    public InputSanitizationMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Method == "POST" || context.Request.Method == "PUT" || context.Request.Method == "PATCH")
        {
            context.Request.EnableBuffering();

            using var reader = new StreamReader(context.Request.Body, leaveOpen: true);
            var body = await reader.ReadToEndAsync();
            context.Request.Body.Position = 0;

            if (ContainsXssPatterns(body))
            {
                context.Response.StatusCode = 400;
                await context.Response.WriteAsync("Request body contains blocked patterns.");
                return;
            }
        }

        foreach (var key in context.Request.Query.Keys)
        {
            var value = context.Request.Query[key].FirstOrDefault() ?? string.Empty;
            if (ContainsXssPatterns(value))
            {
                context.Response.StatusCode = 400;
                await context.Response.WriteAsync("Query string contains blocked patterns.");
                return;
            }
        }

        await _next(context);
    }

    private static bool ContainsXssPatterns(string input)
    {
        return XssPatternRegex().IsMatch(input);
    }

    [GeneratedRegex(@"<script[^>]*>|javascript\s*:|on\w+\s*=|<\s*[^>]*on\w+\s*=|alert\s*\(|prompt\s*\(|confirm\s*\(",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex XssPatternRegex();
}
