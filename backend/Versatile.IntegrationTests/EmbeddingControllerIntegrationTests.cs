using System.Net;
using FluentAssertions;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class EmbeddingControllerIntegrationTests : ControllerTestBase
{
    public EmbeddingControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task MistralEmbed_NoApiKey_ReturnsBadRequest()
    {
        var body = new { model = "mistral-embed", input = new[] { "Hello world" } };
        var response = await PostAsync("/api/embedding/mistral", body);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
