using System.Net;
using FluentAssertions;
using Versatile.Infrastructure.Services;

namespace Versatile.Infrastructure.Tests.Data;

/// <summary>
/// Unit tests for <see cref="UrlFetchGuard"/>. All cases are offline-safe:
/// literal IPs and names are classified without DNS, and the one DNS test
/// uses <c>localhost</c> (hosts-file resolution).
/// </summary>
public class UrlFetchGuardTests
{
    [Theory]
    [InlineData("http://169.254.169.254/latest/meta-data/")]
    [InlineData("http://127.0.0.1/admin")]
    [InlineData("http://10.0.0.5/")]
    [InlineData("http://192.168.1.1/")]
    [InlineData("http://172.16.0.9/")]
    [InlineData("http://0.0.0.0/")]
    [InlineData("http://[::1]/")]
    [InlineData("http://localhost/")]
    [InlineData("http://user:pass@example.com/")]
    [InlineData("ftp://files.example.com/doc.html")]
    [InlineData("file:///etc/passwd")]
    public void TryValidateUri_RejectsBlockedTargets(string url)
    {
        var uri = new Uri(url);

        UrlFetchGuard.TryValidateUri(uri, out _).Should().BeFalse();
    }

    [Theory]
    [InlineData("https://example.com/article")]
    [InlineData("http://example.com:8080/page")]
    public void TryValidateUri_AcceptsPublicTargets(string url)
    {
        var uri = new Uri(url);

        UrlFetchGuard.TryValidateUri(uri, out var reason).Should().BeTrue(reason);
    }

    [Theory]
    [InlineData("127.0.0.1", true)]
    [InlineData("10.1.2.3", true)]
    [InlineData("172.16.5.4", true)]
    [InlineData("172.31.255.255", true)]
    [InlineData("192.168.0.1", true)]
    [InlineData("169.254.169.254", true)]
    [InlineData("100.64.0.1", true)]
    [InlineData("0.0.0.0", true)]
    [InlineData("192.0.2.1", true)]
    [InlineData("198.51.100.7", true)]
    [InlineData("203.0.113.9", true)]
    [InlineData("198.18.0.1", true)]
    [InlineData("224.0.0.1", true)]
    [InlineData("8.8.8.8", false)]
    [InlineData("1.1.1.1", false)]
    [InlineData("172.15.0.1", false)]
    [InlineData("172.32.0.1", false)]
    [InlineData("192.167.0.1", false)]
    public void IsBlockedAddress_ClassifiesIPv4(string ip, bool expectedBlocked)
    {
        UrlFetchGuard.IsBlockedAddress(IPAddress.Parse(ip)).Should().Be(expectedBlocked);
    }

    [Theory]
    [InlineData("::1", true)]
    [InlineData("::", true)]
    [InlineData("fe80::1", true)]
    [InlineData("fc00::1", true)]
    [InlineData("::ffff:127.0.0.1", true)]
    [InlineData("::ffff:10.0.0.1", true)]
    [InlineData("::ffff:8.8.8.8", false)]
    [InlineData("2001:db8::1", true)] // documentation range, never legitimately routable
    public void IsBlockedAddress_ClassifiesIPv6(string ip, bool expectedBlocked)
    {
        UrlFetchGuard.IsBlockedAddress(IPAddress.Parse(ip)).Should().Be(expectedBlocked);
    }

    [Fact]
    public async Task ValidateResolvesToPublicAsync_Localhost_IsBlocked()
    {
        var (ok, _) = await UrlFetchGuard.ValidateResolvesToPublicAsync("localhost");

        ok.Should().BeFalse();
    }

    [Fact]
    public async Task ValidateResolvesToPublicAsync_Unresolvable_IsBlocked()
    {
        var (ok, reason) = await UrlFetchGuard.ValidateResolvesToPublicAsync("nonexistent.invalid");

        ok.Should().BeFalse();
        reason.Should().NotBeNullOrWhiteSpace();
    }
}
