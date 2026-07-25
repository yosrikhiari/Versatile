using System.Net;
using FluentAssertions;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class AntiforgeryControllerIntegrationTests : ControllerTestBase
{
    public AntiforgeryControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task GetToken_ReturnsToken()
    {
        var response = await GetAsync("/api/antiforgery/token");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await ReadBodyAsync<Dictionary<string, string>>(response);
        body.Should().ContainKey("requestToken");
        body.Should().ContainKey("headerName");
        body!["requestToken"].Should().NotBeNullOrEmpty();
    }
}
