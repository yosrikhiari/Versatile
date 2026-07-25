using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class EntityControllerIntegrationTests : ControllerTestBase
{
    public EntityControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { name = "Test Entity", type = "Character", description = (string?)null, metadata = (string?)null };
        var response = await PostAsync($"/api/story/{StoryId}/entity", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { name = "Test Entity", type = "Character", description = (string?)null, metadata = (string?)null };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/entity", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/entity");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { name = "Test Entity", type = "Character", description = (string?)null, metadata = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/entity", body);
        var created = await ReadBodyAsync<EntityDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/entity/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<EntityDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/entity/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { name = "Test Entity", type = "Character", description = (string?)null, metadata = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/entity", body);
        var created = await ReadBodyAsync<EntityDto>(post);

        var update = new { name = "Updated", type = "Character", description = (string?)null, metadata = (string?)null };
        var response = await PutAsync($"/api/story/{StoryId}/entity/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { name = "Test Entity", type = "Character", description = (string?)null, metadata = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/entity", body);
        var created = await ReadBodyAsync<EntityDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/entity/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/entity/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
