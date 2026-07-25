using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class GroupEdgeControllerIntegrationTests : ControllerTestBase
{
    public GroupEdgeControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { sourceGroupId = "s1", targetGroupId = "t1", relationshipType = "connects" };
        var response = await PostAsync($"/api/story/{StoryId}/group-graph-edge", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { sourceGroupId = "s1", targetGroupId = "t1", relationshipType = "connects" };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/group-graph-edge", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/group-graph-edge");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { sourceGroupId = "s1", targetGroupId = "t1", relationshipType = "connects" };
        var post = await PostAsync($"/api/story/{StoryId}/group-graph-edge", body);
        var created = await ReadBodyAsync<GroupEdgeDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/group-graph-edge/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<GroupEdgeDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/group-graph-edge/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { sourceGroupId = "s1", targetGroupId = "t1", relationshipType = "connects" };
        var post = await PostAsync($"/api/story/{StoryId}/group-graph-edge", body);
        var created = await ReadBodyAsync<GroupEdgeDto>(post);

        var update = new { relationshipType = "updated" };
        var response = await PutAsync($"/api/story/{StoryId}/group-graph-edge/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { sourceGroupId = "s1", targetGroupId = "t1", relationshipType = "connects" };
        var post = await PostAsync($"/api/story/{StoryId}/group-graph-edge", body);
        var created = await ReadBodyAsync<GroupEdgeDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/group-graph-edge/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/group-graph-edge/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
