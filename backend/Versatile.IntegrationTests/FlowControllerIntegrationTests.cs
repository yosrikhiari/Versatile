using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class FlowControllerIntegrationTests : ControllerTestBase
{
    public FlowControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { nodes = "[]", edges = "[]" };
        var response = await PutAsync($"/api/story/{StoryId}/flow", body);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Get_WithExistingFlow_ReturnsOk()
    {
        var body = new { nodes = "[]", edges = "[]" };
        await PutAsync($"/api/story/{StoryId}/flow", body);

        var response = await GetAsync($"/api/story/{StoryId}/flow");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var flow = await ReadBodyAsync<FlowDto>(response);
        flow!.Nodes.Should().Be("[]");
        flow.Edges.Should().Be("[]");
    }

    [Fact]
    public async Task Get_WithoutFlow_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/flow");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
