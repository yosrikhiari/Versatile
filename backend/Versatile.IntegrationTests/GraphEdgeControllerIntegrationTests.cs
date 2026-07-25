using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class GraphEdgeControllerIntegrationTests : ControllerTestBase
{
    public GraphEdgeControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { sourceId = "s1", targetId = "t1", sourceType = "entity", targetType = "entity", relationshipType = "relates" };
        var response = await PostAsync($"/api/story/{StoryId}/graph-edge", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { sourceId = "s1", targetId = "t1", sourceType = "entity", targetType = "entity", relationshipType = "relates" };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/graph-edge", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/graph-edge");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { sourceId = "s1", targetId = "t1", sourceType = "entity", targetType = "entity", relationshipType = "relates" };
        var post = await PostAsync($"/api/story/{StoryId}/graph-edge", body);
        var created = await ReadBodyAsync<GraphEdgeDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/graph-edge/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<GraphEdgeDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/graph-edge/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { sourceId = "s1", targetId = "t1", sourceType = "entity", targetType = "entity", relationshipType = "relates" };
        var post = await PostAsync($"/api/story/{StoryId}/graph-edge", body);
        var created = await ReadBodyAsync<GraphEdgeDto>(post);

        var update = new { relationshipType = "updated" };
        var response = await PutAsync($"/api/story/{StoryId}/graph-edge/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { sourceId = "s1", targetId = "t1", sourceType = "entity", targetType = "entity", relationshipType = "relates" };
        var post = await PostAsync($"/api/story/{StoryId}/graph-edge", body);
        var created = await ReadBodyAsync<GraphEdgeDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/graph-edge/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/graph-edge/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
