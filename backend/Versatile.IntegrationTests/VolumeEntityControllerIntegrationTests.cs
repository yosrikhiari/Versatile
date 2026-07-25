using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class VolumeEntityControllerIntegrationTests : ControllerTestBase
{
    public VolumeEntityControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var volumeBody = new { title = "Test Volume", description = (string?)null, color = (string?)null, sortOrder = (int?)null, chapterIds = (string?)null };
        var volumePost = await PostAsync($"/api/story/{StoryId}/volume", volumeBody);
        var volume = await ReadBodyAsync<VolumeDto>(volumePost);

        var body = new { volumeId = volume!.Id, entityType = "Character", entityId = "test-entity", isPrimary = (bool?)true };
        var response = await PostAsync($"/api/story/{StoryId}/volume-entity", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { volumeId = Guid.NewGuid(), entityType = "Character", entityId = "test-entity", isPrimary = (bool?)true };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/volume-entity", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/volume-entity");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var volumeBody = new { title = "Test Volume", description = (string?)null, color = (string?)null, sortOrder = (int?)null, chapterIds = (string?)null };
        var volumePost = await PostAsync($"/api/story/{StoryId}/volume", volumeBody);
        var volume = await ReadBodyAsync<VolumeDto>(volumePost);

        var body = new { volumeId = volume!.Id, entityType = "Character", entityId = "test-entity", isPrimary = (bool?)true };
        var post = await PostAsync($"/api/story/{StoryId}/volume-entity", body);
        var created = await ReadBodyAsync<VolumeEntityDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/volume-entity/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<VolumeEntityDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/volume-entity/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var volumeBody = new { title = "Test Volume", description = (string?)null, color = (string?)null, sortOrder = (int?)null, chapterIds = (string?)null };
        var volumePost = await PostAsync($"/api/story/{StoryId}/volume", volumeBody);
        var volume = await ReadBodyAsync<VolumeDto>(volumePost);

        var body = new { volumeId = volume!.Id, entityType = "Character", entityId = "test-entity", isPrimary = (bool?)true };
        var post = await PostAsync($"/api/story/{StoryId}/volume-entity", body);
        var created = await ReadBodyAsync<VolumeEntityDto>(post);

        var update = new { volumeId = volume.Id, entityType = "Character", entityId = "test-entity", isPrimary = (bool?)false };
        var response = await PutAsync($"/api/story/{StoryId}/volume-entity/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var volumeBody = new { title = "Test Volume", description = (string?)null, color = (string?)null, sortOrder = (int?)null, chapterIds = (string?)null };
        var volumePost = await PostAsync($"/api/story/{StoryId}/volume", volumeBody);
        var volume = await ReadBodyAsync<VolumeDto>(volumePost);

        var body = new { volumeId = volume!.Id, entityType = "Character", entityId = "test-entity", isPrimary = (bool?)true };
        var post = await PostAsync($"/api/story/{StoryId}/volume-entity", body);
        var created = await ReadBodyAsync<VolumeEntityDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/volume-entity/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/volume-entity/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
