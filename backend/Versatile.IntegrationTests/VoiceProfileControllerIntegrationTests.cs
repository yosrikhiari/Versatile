using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class VoiceProfileControllerIntegrationTests : ControllerTestBase
{
    public VoiceProfileControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { name = "Test Voice", settings = (string?)null };
        var response = await PostAsync($"/api/story/{StoryId}/voice-profile", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { name = "Test Voice", settings = (string?)null };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/voice-profile", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/voice-profile");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { name = "Test Voice", settings = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/voice-profile", body);
        var created = await ReadBodyAsync<VoiceProfileDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/voice-profile/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<VoiceProfileDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/voice-profile/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { name = "Test Voice", settings = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/voice-profile", body);
        var created = await ReadBodyAsync<VoiceProfileDto>(post);

        var update = new { name = "Updated", settings = (string?)null };
        var response = await PutAsync($"/api/story/{StoryId}/voice-profile/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { name = "Test Voice", settings = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/voice-profile", body);
        var created = await ReadBodyAsync<VoiceProfileDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/voice-profile/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/voice-profile/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
