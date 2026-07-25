using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class GraphGroupControllerIntegrationTests : ControllerTestBase
{
    public GraphGroupControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { label = "Test Group", color = "#ff0000" };
        var response = await PostAsync($"/api/story/{StoryId}/graph-group", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { label = "Test Group", color = "#ff0000" };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/graph-group", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/graph-group");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { label = "Test Group", color = "#ff0000" };
        var post = await PostAsync($"/api/story/{StoryId}/graph-group", body);
        var created = await ReadBodyAsync<GraphGroupDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/graph-group/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<GraphGroupDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/graph-group/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { label = "Test Group", color = "#ff0000" };
        var post = await PostAsync($"/api/story/{StoryId}/graph-group", body);
        var created = await ReadBodyAsync<GraphGroupDto>(post);

        var update = new { label = "Updated" };
        var response = await PutAsync($"/api/story/{StoryId}/graph-group/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { label = "Test Group", color = "#ff0000" };
        var post = await PostAsync($"/api/story/{StoryId}/graph-group", body);
        var created = await ReadBodyAsync<GraphGroupDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/graph-group/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/graph-group/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
