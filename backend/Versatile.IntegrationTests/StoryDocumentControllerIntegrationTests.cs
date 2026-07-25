using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class StoryDocumentControllerIntegrationTests : ControllerTestBase
{
    public StoryDocumentControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/story-document", new { DocType = "note", Title = "Research Notes", Content = "Some notes..." });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<StoryDocumentDto>(response);
        dto.Should().NotBeNull();
        dto!.DocType.Should().Be("note");
        dto.Title.Should().Be("Research Notes");
        dto.Content.Should().Be("Some notes...");
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMinimalData_Works()
    {
        var response = await PostAsync($"/api/story/{StoryId}/story-document", new { DocType = "note", Title = "Minimal" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<StoryDocumentDto>(response);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Minimal");
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/story-document", new { DocType = "note", Title = "Orphan" });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/story-document", new { DocType = "note", Title = "B" });
        var responseB = await PostAsync($"/api/story/{StoryId}/story-document", new { DocType = "outline", Title = "A" });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/story-document");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var items = await ReadBodyAsync<List<StoryDocumentDto>>(listResponse);
        items.Should().NotBeNull();
        items!.Count.Should().BeGreaterThanOrEqualTo(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/story-document", new { DocType = "note", Title = "Find Me" });
        var created = await ReadBodyAsync<StoryDocumentDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/story-document/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<StoryDocumentDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/story-document/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/story-document", new { DocType = "note", Title = "Old", Content = "Old content" });
        var created = await ReadBodyAsync<StoryDocumentDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/story-document/{created!.Id}", new { Title = "New" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<StoryDocumentDto>(updateResponse);
        updated!.Title.Should().Be("New");
        updated.Content.Should().Be("Old content");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/story-document", new { DocType = "note", Title = "Original" });
        var created = await ReadBodyAsync<StoryDocumentDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/story-document/{created!.Id}", new { DocType = "outline" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<StoryDocumentDto>(updateResponse);
        updated!.DocType.Should().Be("outline");
        updated.Title.Should().Be("Original");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/story-document", new { DocType = "note", Title = "To Delete" });
        var created = await ReadBodyAsync<StoryDocumentDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/story-document/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/story-document/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/story-document/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
