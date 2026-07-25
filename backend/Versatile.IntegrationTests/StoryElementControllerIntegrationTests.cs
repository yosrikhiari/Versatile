using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class StoryElementControllerIntegrationTests : ControllerTestBase
{
    public StoryElementControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { type = "Note", title = "Test", x = 100.0, y = 200.0, width = 300.0, height = 100.0, data = (string?)null };
        var response = await PostAsync($"/api/story/{StoryId}/story-element", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { type = "Note", title = "Test", x = 100.0, y = 200.0, width = 300.0, height = 100.0, data = (string?)null };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/story-element", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/story-element");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { type = "Note", title = "Test", x = 100.0, y = 200.0, width = 300.0, height = 100.0, data = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/story-element", body);
        var created = await ReadBodyAsync<StoryElementDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/story-element/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<StoryElementDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/story-element/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { type = "Note", title = "Test", x = 100.0, y = 200.0, width = 300.0, height = 100.0, data = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/story-element", body);
        var created = await ReadBodyAsync<StoryElementDto>(post);

        var update = new { type = "Note", title = "Updated", x = 100.0, y = 200.0, width = 300.0, height = 100.0, data = (string?)null };
        var response = await PutAsync($"/api/story/{StoryId}/story-element/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { type = "Note", title = "Test", x = 100.0, y = 200.0, width = 300.0, height = 100.0, data = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/story-element", body);
        var created = await ReadBodyAsync<StoryElementDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/story-element/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/story-element/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
