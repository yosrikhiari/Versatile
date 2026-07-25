using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class SnapshotControllerIntegrationTests : ControllerTestBase
{
    public SnapshotControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { chapterId = (Guid?)null, timestamp = DateTime.UtcNow, label = "Test", data = "{}" };
        var response = await PostAsync($"/api/story/{StoryId}/snapshot", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { chapterId = (Guid?)null, timestamp = DateTime.UtcNow, label = "Test", data = "{}" };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/snapshot", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/snapshot");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { chapterId = (Guid?)null, timestamp = DateTime.UtcNow, label = "Test", data = "{}" };
        var post = await PostAsync($"/api/story/{StoryId}/snapshot", body);
        var created = await ReadBodyAsync<SnapshotDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/snapshot/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var snapshot = await ReadBodyAsync<SnapshotDto>(response);
        snapshot!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/snapshot/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { chapterId = (Guid?)null, timestamp = DateTime.UtcNow, label = "Test", data = "{}" };
        var post = await PostAsync($"/api/story/{StoryId}/snapshot", body);
        var created = await ReadBodyAsync<SnapshotDto>(post);

        var update = new { chapterId = (Guid?)null, label = "Updated", data = "{}" };
        var response = await PutAsync($"/api/story/{StoryId}/snapshot/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { chapterId = (Guid?)null, timestamp = DateTime.UtcNow, label = "Test", data = "{}" };
        var post = await PostAsync($"/api/story/{StoryId}/snapshot", body);
        var created = await ReadBodyAsync<SnapshotDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/snapshot/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/snapshot/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
