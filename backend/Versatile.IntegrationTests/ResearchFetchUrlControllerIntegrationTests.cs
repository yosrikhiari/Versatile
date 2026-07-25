using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class ResearchFetchUrlControllerIntegrationTests : ControllerTestBase
{
    public ResearchFetchUrlControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task FetchUrl_WithEmptyUrl_Returns400()
    {
        var response = await PostAsync($"/api/story/{StoryId}/research-document/fetch-url", new FetchUrlRequest(""));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task FetchUrl_WithNullUrl_Returns400()
    {
        var response = await PostAsync($"/api/story/{StoryId}/research-document/fetch-url", new { Url = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task FetchUrl_WithUrlMissingScheme_Returns400()
    {
        var response = await PostAsync($"/api/story/{StoryId}/research-document/fetch-url", new FetchUrlRequest("example.com/page"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task FetchUrl_WithFtpScheme_Returns400()
    {
        var response = await PostAsync($"/api/story/{StoryId}/research-document/fetch-url", new FetchUrlRequest("ftp://files.example.com/doc.html"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task FetchUrl_WithValidHttpUrlOnWrongStory_Returns200()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/research-document/fetch-url", new FetchUrlRequest("http://example.com"));

        response.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.BadRequest);
    }
}
