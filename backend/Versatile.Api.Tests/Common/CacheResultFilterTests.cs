using System.Collections.Concurrent;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Versatile.Api.Common;
using Versatile.Application.Common;

namespace Versatile.Api.Tests.Common;

/// <summary>
/// The response cache must not serve a read from before a write. It did:
/// nothing invalidated it, so a GET after a PUT returned the old row for up to
/// the cache duration (found by the live sync round trip, 2026-10-04).
/// </summary>
public sealed class CacheResultFilterTests
{
    private sealed class MemoryCache : ICacheService
    {
        public readonly ConcurrentDictionary<string, object?> Items = new();
        public Task<T?> GetAsync<T>(string key, CancellationToken ct = default) =>
            Task.FromResult(Items.TryGetValue(key, out var v) ? (T?)v : default);
        public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default)
        { Items[key] = value; return Task.CompletedTask; }
        public Task RemoveAsync(string key, CancellationToken ct = default)
        { Items.TryRemove(key, out _); return Task.CompletedTask; }
        public Task<T?> GetOrCreateAsync<T>(string key, Func<Task<T>> factory, TimeSpan? expiry = null, CancellationToken ct = default) =>
            throw new NotSupportedException();
    }

    private sealed class Probe
    {
        [Cacheable(120)] public void List() { }
        public void Write() { }
    }

    private static readonly Guid Org = Guid.NewGuid();

    private static async Task<IActionResult?> Run(CacheResultFilter filter, string method, string action, Func<IActionResult> body)
    {
        var http = new DefaultHttpContext();
        http.Request.Method = method;
        http.Request.Path = "/api/story/s/section";
        http.Items["OrganizationId"] = Org;
        var descriptor = new ControllerActionDescriptor { MethodInfo = typeof(Probe).GetMethod(action)! };
        var actionContext = new ActionContext(http, new RouteData(), descriptor);
        var executing = new ActionExecutingContext(actionContext, new List<IFilterMetadata>(), new Dictionary<string, object?>(), new object());

        await filter.OnActionExecutionAsync(executing, () =>
            Task.FromResult(new ActionExecutedContext(actionContext, new List<IFilterMetadata>(), new object()) { Result = body() }));
        return executing.Result;
    }

    [Fact]
    public async Task A_read_after_a_write_is_not_served_from_before_it()
    {
        var filter = new CacheResultFilter(new MemoryCache());

        var first = await Run(filter, "GET", nameof(Probe.List), () => new OkObjectResult("v1"));
        first.Should().BeNull("the first read executes the action and fills the cache");

        var hit = await Run(filter, "GET", nameof(Probe.List), () => new OkObjectResult("never"));
        hit.Should().BeOfType<ObjectResult>().Which.Value.Should().Be("v1");

        await Run(filter, "PUT", nameof(Probe.Write), () => new OkObjectResult("saved"));

        var after = await Run(filter, "GET", nameof(Probe.List), () => new OkObjectResult("v2"));
        after.Should().BeNull("the write retired the cached v1, so the action runs again");
    }

    [Fact]
    public async Task A_failed_write_keeps_the_cache()
    {
        var filter = new CacheResultFilter(new MemoryCache());
        await Run(filter, "GET", nameof(Probe.List), () => new OkObjectResult("v1"));

        await Run(filter, "PUT", nameof(Probe.Write), () => new NotFoundObjectResult("nope"));

        var hit = await Run(filter, "GET", nameof(Probe.List), () => new OkObjectResult("never"));
        hit.Should().BeOfType<ObjectResult>().Which.Value.Should().Be("v1");
    }
}
