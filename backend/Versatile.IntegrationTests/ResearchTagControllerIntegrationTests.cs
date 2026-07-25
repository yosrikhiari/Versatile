using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class ResearchTagControllerIntegrationTests : ControllerTestBase
{
    public ResearchTagControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/research-tag", new CreateResearchTagRequest("Important", "#ff0000"));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<ResearchTagDto>(response);
        dto.Should().NotBeNull();
        dto!.Name.Should().Be("Important");
        dto.Color.Should().Be("#ff0000");
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithOptionalColorNull_Works()
    {
        var response = await PostAsync($"/api/story/{StoryId}/research-tag", new CreateResearchTagRequest("NoColor", null));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<ResearchTagDto>(response);
        dto.Should().NotBeNull();
        dto!.Name.Should().Be("NoColor");
        dto.Color.Should().BeEmpty();
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/research-tag", new CreateResearchTagRequest("Orphan", null));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByName()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/research-tag", new CreateResearchTagRequest("B", null));
        var responseB = await PostAsync($"/api/story/{StoryId}/research-tag", new CreateResearchTagRequest("A", null));
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/research-tag");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var tags = await ReadBodyAsync<List<ResearchTagDto>>(listResponse);
        tags.Should().NotBeNull();
        tags!.Select(t => t.Name).Should().Equal("A", "B");
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-tag", new CreateResearchTagRequest("Find Me", null));
        var created = await ReadBodyAsync<ResearchTagDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/research-tag/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<ResearchTagDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Name.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/research-tag/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-tag", new CreateResearchTagRequest("Old", "#000"));
        var created = await ReadBodyAsync<ResearchTagDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/research-tag/{created!.Id}", new UpdateResearchTagRequest("New", "#fff"));
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<ResearchTagDto>(updateResponse);
        updated!.Name.Should().Be("New");
        updated.Color.Should().Be("#fff");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-tag", new CreateResearchTagRequest("Original", "#abc"));
        var created = await ReadBodyAsync<ResearchTagDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/research-tag/{created!.Id}", new UpdateResearchTagRequest("Renamed", null));
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<ResearchTagDto>(updateResponse);
        updated!.Name.Should().Be("Renamed");
        updated.Color.Should().Be("#abc");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-tag", new CreateResearchTagRequest("To Delete", null));
        var created = await ReadBodyAsync<ResearchTagDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/research-tag/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/research-tag/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/research-tag/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
