using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class StoryStateSnapshotControllerIntegrationTests : ControllerTestBase
{
    public StoryStateSnapshotControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { data = "{}" };
        var response = await PostAsync($"/api/story/{StoryId}/story-state-snapshot", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { data = "{}" };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/story-state-snapshot", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/story-state-snapshot");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { data = "{}" };
        var post = await PostAsync($"/api/story/{StoryId}/story-state-snapshot", body);
        var created = await ReadBodyAsync<StoryStateSnapshotDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/story-state-snapshot/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<StoryStateSnapshotDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/story-state-snapshot/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { data = "{}" };
        var post = await PostAsync($"/api/story/{StoryId}/story-state-snapshot", body);
        var created = await ReadBodyAsync<StoryStateSnapshotDto>(post);

        var update = new { data = "{\"updated\": true}" };
        var response = await PutAsync($"/api/story/{StoryId}/story-state-snapshot/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { data = "{}" };
        var post = await PostAsync($"/api/story/{StoryId}/story-state-snapshot", body);
        var created = await ReadBodyAsync<StoryStateSnapshotDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/story-state-snapshot/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/story-state-snapshot/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
