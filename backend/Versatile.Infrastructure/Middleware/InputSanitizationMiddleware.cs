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

    /// <summary>
    /// Coarse stored-XSS backstop. Every alternative is anchored to markup
    /// (<c>&lt;script</c>, an event handler inside a tag, a
    /// <c>javascript:</c> URL): a payload that can execute must ride in a tag
    /// or URL, while bare words with parentheses (<c>alert (the police)</c>,
    /// <c>prompt (a laugh)</c>, <c>confirm (the booking)</c>) and
    /// <c>word=</c> pairs (<c>the one = hero</c>) are ordinary fiction prose.
    /// An earlier revision also blocked those bare forms and rejected
    /// innocent novels — see the innocent-prose tests. There are no v-html
    /// sinks today (frontend <c>sanitizeHtml</c> awaits them), so this stays a
    /// backstop, not a sanitizer: it never rewrites, only rejects.
    /// </summary>
    [GeneratedRegex(@"<script[^>]*>|javascript\s*:|<\s*[^>]*on\w+\s*=",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex XssPatternRegex();
}
