using FluentAssertions;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging.Abstractions;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Tests.Infrastructure;

/// <summary>
/// The cache must fail OPEN: a dead Redis degrades to uncached responses,
/// never 500s (compose proved this: cached GETs died on RedisConnectionException).
/// </summary>
public class RedisCacheServiceTests
{
    private sealed class ThrowingCache : IDistributedCache
    {
        public byte[]? Get(string key) => throw new InvalidOperationException("redis down");
        public Task<byte[]?> GetAsync(string key, CancellationToken token = default) => throw new InvalidOperationException("redis down");
        public void Refresh(string key) => throw new InvalidOperationException("redis down");
        public Task RefreshAsync(string key, CancellationToken token = default) => throw new InvalidOperationException("redis down");
        public void Remove(string key) => throw new InvalidOperationException("redis down");
        public Task RemoveAsync(string key, CancellationToken token = default) => throw new InvalidOperationException("redis down");
        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => throw new InvalidOperationException("redis down");
        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) => throw new InvalidOperationException("redis down");
    }

    private static RedisCacheService Create() =>
        new(new ThrowingCache(), NullLogger<RedisCacheService>.Instance);

    [Fact]
    public async Task Get_WhenRedisDown_ReturnsMissInsteadOfThrowing()
    {
        var result = await Create().GetAsync<string>("any-key");

        result.Should().BeNull();
    }

    [Fact]
    public async Task Set_WhenRedisDown_DoesNotThrow()
    {
        await FluentActions
            .Awaiting(() => Create().SetAsync("any-key", "value", TimeSpan.FromMinutes(1)))
            .Should().NotThrowAsync();
    }

    [Fact]
    public async Task Remove_WhenRedisDown_DoesNotThrow()
    {
        await FluentActions
            .Awaiting(() => Create().RemoveAsync("any-key"))
            .Should().NotThrowAsync();
    }

    [Fact]
    public async Task GetOrCreate_WhenRedisDown_ReturnsFactoryValue()
    {
        var result = await Create().GetOrCreateAsync("any-key", () => Task.FromResult("fresh"));

        result.Should().Be("fresh");
    }
}
