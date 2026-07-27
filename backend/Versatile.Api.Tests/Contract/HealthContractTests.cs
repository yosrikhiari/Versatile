using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Versatile.Api.Tests.Infrastructure;

namespace Versatile.Api.Tests.Contract;

[Trait("Category", "Contract")]
public sealed class HealthContractTests : IClassFixture<PostgreSqlFixture>
{
    private readonly HttpClient _client;

    public HealthContractTests(PostgreSqlFixture fixture)
    {
        _client = new HttpClient { BaseAddress = new Uri("http://localhost:5000") };
    }

    [Fact(Skip = "Requires running API at http://localhost:5000")]
    public async Task HealthEndpoint_ReturnsOkWithJsonBody()
    {
        var response = await _client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/json");

        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        body.Should().NotBeNull();
        body!.Status.Should().Be("Healthy");
        body.Checks.Should().NotBeNull();
    }

    private sealed class HealthResponse
    {
        public string Status { get; set; } = string.Empty;
        public Dictionary<string, string>? Checks { get; set; }
    }
}