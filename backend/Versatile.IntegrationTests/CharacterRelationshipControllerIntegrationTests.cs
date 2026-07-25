using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class CharacterRelationshipControllerIntegrationTests : ControllerTestBase
{
    public CharacterRelationshipControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { fromCharacterId = Guid.NewGuid(), toCharacterId = Guid.NewGuid(), relationshipType = "Friend", notes = (string?)null };
        var response = await PostAsync($"/api/story/{StoryId}/character-relationship", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { fromCharacterId = Guid.NewGuid(), toCharacterId = Guid.NewGuid(), relationshipType = "Friend", notes = (string?)null };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/character-relationship", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/character-relationship");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { fromCharacterId = Guid.NewGuid(), toCharacterId = Guid.NewGuid(), relationshipType = "Friend", notes = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/character-relationship", body);
        var created = await ReadBodyAsync<CharacterRelationshipDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/character-relationship/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<CharacterRelationshipDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/character-relationship/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { fromCharacterId = Guid.NewGuid(), toCharacterId = Guid.NewGuid(), relationshipType = "Friend", notes = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/character-relationship", body);
        var created = await ReadBodyAsync<CharacterRelationshipDto>(post);

        var update = new { fromCharacterId = Guid.NewGuid(), toCharacterId = Guid.NewGuid(), relationshipType = "Enemy", notes = (string?)null };
        var response = await PutAsync($"/api/story/{StoryId}/character-relationship/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { fromCharacterId = Guid.NewGuid(), toCharacterId = Guid.NewGuid(), relationshipType = "Friend", notes = (string?)null };
        var post = await PostAsync($"/api/story/{StoryId}/character-relationship", body);
        var created = await ReadBodyAsync<CharacterRelationshipDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/character-relationship/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/character-relationship/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
