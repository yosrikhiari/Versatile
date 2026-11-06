using System.IO;
using System.Net;
using System.Net.Sockets;

namespace Versatile.Infrastructure.Services;

/// <summary>
/// Server-side request forgery (SSRF) guard for user-supplied fetch URLs
/// (currently <c>POST /api/story/{storyId}/research-document/fetch-url</c>).
///
/// Policy: only <c>http(s)</c> URLs whose host is neither a blocked name nor
/// a literal blocked IP, and which resolve <b>exclusively</b> to public IPs.
/// Rejects loopback, RFC 1918, link-local (cloud metadata 169.254.169.254),
/// carrier-grade NAT, documentation ranges, multicast/reserved, IPv6
/// loopback/link-local/unique-local and IPv4-mapped private addresses.
/// Anything unresolvable is rejected (fail-closed).
///
/// The URL-fetch client uses <see cref="ConnectToPublicAddressAsync"/> as its
/// connection callback. The callback resolves and validates the host, then
/// connects directly to one of those validated IPs, closing the DNS
/// check/connect rebinding window. Redirects go through the same callback.
/// </summary>
public static class UrlFetchGuard
{
    public const int MaxRedirects = 3;

    /// <summary>
    /// Resolve and pin the actual socket to a public address. Validating DNS
    /// separately from HttpClient's own hostname resolution leaves a rebinding
    /// window; this callback uses the checked IP for the TCP connection while
    /// HttpClient retains the request hostname for HTTP Host and TLS SNI.
    /// </summary>
    public static async ValueTask<Stream> ConnectToPublicAddressAsync(
        SocketsHttpConnectionContext context,
        CancellationToken cancellationToken)
        => await ConnectToPublicAddressAsync(context.DnsEndPoint, cancellationToken);

    public static async ValueTask<Stream> ConnectToPublicAddressAsync(
        DnsEndPoint endpoint,
        CancellationToken cancellationToken)
    {
        if (IsBlockedHostName(endpoint.Host))
            throw new HttpRequestException("Fetching from that host is not allowed.");

        IPAddress[] addresses;
        try
        {
            addresses = IPAddress.TryParse(endpoint.Host, out var literal)
                ? [literal]
                : await Dns.GetHostAddressesAsync(endpoint.Host, cancellationToken);
        }
        catch (SocketException ex)
        {
            throw new HttpRequestException("The host could not be resolved.", ex);
        }

        if (addresses.Length == 0 || addresses.Any(IsBlockedAddress))
            throw new HttpRequestException("Fetching from that address is not allowed.");

        SocketException? lastError = null;
        foreach (var address in addresses)
        {
            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp)
            {
                NoDelay = true
            };
            try
            {
                await socket.ConnectAsync(new IPEndPoint(address, endpoint.Port), cancellationToken);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch (SocketException ex)
            {
                lastError = ex;
                socket.Dispose();
            }
            catch
            {
                socket.Dispose();
                throw;
            }
        }

        throw new HttpRequestException("Could not connect to the validated public address.", lastError);
    }

    public static bool TryValidateUri(Uri uri, out string reason)
    {
        if (uri.Scheme != "http" && uri.Scheme != "https")
        {
            reason = "URL must start with http:// or https://.";
            return false;
        }

        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            reason = "URLs with credentials are not allowed.";
            return false;
        }

        if (IsBlockedHostName(uri.Host))
        {
            reason = "Fetching from that host is not allowed.";
            return false;
        }

        if (IPAddress.TryParse(uri.Host, out var literal) && IsBlockedAddress(literal))
        {
            reason = "Fetching from that address is not allowed.";
            return false;
        }

        reason = string.Empty;
        return true;
    }

    public static bool IsBlockedHostName(string host) =>
        host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
        host.Equals("localhost.", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Resolves <paramref name="host"/> and requires every address to be
    /// public. Fail-closed: empty answers and DNS errors reject.
    /// </summary>
    public static async Task<(bool Ok, string Reason)> ValidateResolvesToPublicAsync(
        string host, CancellationToken cancellationToken = default)
    {
        IPAddress[] addresses;
        try
        {
            addresses = await Dns.GetHostAddressesAsync(host, cancellationToken);
        }
        catch (SocketException)
        {
            return (false, "The host could not be resolved.");
        }

        if (addresses.Length == 0)
            return (false, "The host could not be resolved.");

        if (addresses.Any(IsBlockedAddress))
            return (false, "Fetching from that address is not allowed.");

        return (true, string.Empty);
    }

    public static bool IsBlockedAddress(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6)
            address = address.MapToIPv4();

        var bytes = address.GetAddressBytes();
        if (bytes.Length == 4)
        {
            var ip = ((uint)bytes[0] << 24) | ((uint)bytes[1] << 16) | ((uint)bytes[2] << 8) | bytes[3];
            return IsBlockedIPv4(ip);
        }

        // Only global-unicast 2000::/3 is allowed. This excludes unspecified,
        // loopback, link-local, unique-local, multicast, site-local, and other
        // reserved/non-global ranges before the narrower documentation and
        // transition-network exclusions below.
        if (address.Equals(IPAddress.IPv6None) || address.Equals(IPAddress.IPv6Loopback))
            return true;
        if ((bytes[0] & 0xE0) != 0x20)
            return true;
        if (bytes[0] == 0x20 && bytes[1] == 0x01 &&
            ((bytes[2] & 0xFE) == 0x00 || (bytes[2] == 0x0D && bytes[3] == 0xB8)))
            return true; // IETF protocol assignments (2001:0000::/23), documentation.
        if (bytes[0] == 0x20 && bytes[1] == 0x02)
            return true; // 6to4 can encode a non-public IPv4 destination.
        if (bytes[0] == 0x3F && bytes[1] == 0xFF && (bytes[2] & 0xF0) == 0x00)
            return true;
        return false;
    }

    private static bool IsBlockedIPv4(uint ip)
    {
        // 0.0.0.0/8 ("this network"), 127.0.0.0/8 (loopback).
        if ((ip & 0xFF000000) is 0x00000000 or 0x7F000000)
            return true;
        // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC 1918).
        if ((ip & 0xFF000000) == 0x0A000000)
            return true;
        if ((ip & 0xFFF00000) == 0xAC100000)
            return true;
        if ((ip & 0xFFFF0000) == 0xC0A80000)
            return true;
        // 100.64.0.0/10 (CGNAT), 169.254.0.0/16 (link-local, cloud metadata).
        if ((ip & 0xFFC00000) == 0x64400000)
            return true;
        if ((ip & 0xFFFF0000) == 0xA9FE0000)
            return true;
        // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1), 198.51.100.0/24 (TEST-NET-2),
        // 203.0.113.0/24 (TEST-NET-3), 198.18.0.0/15 (benchmarking).
        if ((ip & 0xFFFFFF00) is 0xC0000000 or 0xC0000200 or 0xC6336400 or 0xCB007100)
            return true;
        if ((ip & 0xFFFE0000) == 0xC6120000)
            return true;
        // 224.0.0.0/4+ (multicast, reserved, future use): unroutable for fetch.
        if ((ip & 0xF0000000) == 0xE0000000 || (ip & 0xF0000000) == 0xF0000000)
            return true;
        return false;
    }
}
