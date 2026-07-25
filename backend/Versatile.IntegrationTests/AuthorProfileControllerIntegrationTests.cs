using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Versatile.Application.AuthorProfiles.Commands;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class AuthorProfileControllerIntegrationTests : ControllerTestBase
{
    public AuthorProfileControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/author-profile", new CreateAuthorProfileCommand(StoryId, "John Doe", "JD", "A bio", null, OrgId, UserId));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<AuthorProfileDto>(response);
        dto.Should().NotBeNull();
        dto!.DisplayName.Should().Be("John Doe");
        dto.PenName.Should().Be("JD");
        dto.Bio.Should().Be("A bio");
        dto.Settings.Should().BeNull();
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var response = await PostAsync($"/api/story/{StoryId}/author-profile", new CreateAuthorProfileCommand(StoryId, "Name", "Pen", null, null, OrgId, UserId));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<AuthorProfileDto>(response);
        dto.Should().NotBeNull();
        dto!.Bio.Should().BeNull();
        dto.Settings.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/author-profile", new CreateAuthorProfileCommand(Guid.NewGuid(), "Name", "Pen", null, null, OrgId, UserId));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/author-profile", new CreateAuthorProfileCommand(StoryId, "A", "PenA", null, null, OrgId, UserId));
        var responseB = await PostAsync($"/api/story/{StoryId}/author-profile", new CreateAuthorProfileCommand(StoryId, "B", "PenB", null, null, OrgId, UserId));
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/author-profile");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var profiles = await ReadBodyAsync<List<AuthorProfileDto>>(listResponse);
        profiles.Should().NotBeNull();
        profiles!.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/author-profile", new CreateAuthorProfileCommand(StoryId, "Find Me", "FM", null, null, OrgId, UserId));
        var created = await ReadBodyAsync<AuthorProfileDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/author-profile/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<AuthorProfileDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.DisplayName.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/author-profile/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/author-profile", new CreateAuthorProfileCommand(StoryId, "Original", "OP", "Old bio", null, OrgId, UserId));
        var created = await ReadBodyAsync<AuthorProfileDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/author-profile/{created!.Id}", new UpdateAuthorProfileCommand(created.Id, "Updated", "UP", "New bio", "{}", OrgId, UserId));
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<AuthorProfileDto>(updateResponse);
        updated!.DisplayName.Should().Be("Updated");
        updated.PenName.Should().Be("UP");
        updated.Bio.Should().Be("New bio");
        updated.Settings.Should().Be("{}");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/author-profile", new CreateAuthorProfileCommand(StoryId, "Original", "OP", "Bio", null, OrgId, UserId));
        var created = await ReadBodyAsync<AuthorProfileDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/author-profile/{created!.Id}", new UpdateAuthorProfileCommand(created.Id, DisplayName: "Only Display Changed", PenName: null, Bio: null, Settings: null, OrgId, UserId));
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<AuthorProfileDto>(updateResponse);
        updated!.DisplayName.Should().Be("Only Display Changed");
        updated.PenName.Should().Be("OP");
        updated.Bio.Should().Be("Bio");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/author-profile", new CreateAuthorProfileCommand(StoryId, "To Delete", "TD", null, null, OrgId, UserId));
        var created = await ReadBodyAsync<AuthorProfileDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/author-profile/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/author-profile/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/author-profile/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
