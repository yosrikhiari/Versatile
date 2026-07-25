using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class ResearchDocumentControllerIntegrationTests : ControllerTestBase
{
    public ResearchDocumentControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/research-document", new { FileName = "test.txt", FileType = "text", Content = "file content", Notes = "some notes" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<ResearchDocumentDto>(response);
        dto.Should().NotBeNull();
        dto!.FileName.Should().Be("test.txt");
        dto.FileType.Should().Be("text");
        dto.Content.Should().Be("file content");
        dto.Notes.Should().Be("some notes");
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMinimalData_Works()
    {
        var response = await PostAsync($"/api/story/{StoryId}/research-document", new { FileName = "min.txt", FileType = "text" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<ResearchDocumentDto>(response);
        dto.Should().NotBeNull();
        dto!.FileName.Should().Be("min.txt");
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/research-document", new { FileName = "orphan.txt", FileType = "text" });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/research-document", new { FileName = "A.txt", FileType = "text" });
        var responseB = await PostAsync($"/api/story/{StoryId}/research-document", new { FileName = "B.txt", FileType = "text" });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/research-document");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var docs = await ReadBodyAsync<List<ResearchDocumentDto>>(listResponse);
        docs.Should().NotBeNull();
        docs!.Select(d => d.FileName).Should().Contain("A.txt").And.Contain("B.txt");
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-document", new { FileName = "find.txt", FileType = "text" });
        var created = await ReadBodyAsync<ResearchDocumentDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/research-document/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<ResearchDocumentDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.FileName.Should().Be("find.txt");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/research-document/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-document", new { FileName = "old.txt", FileType = "text", Content = "old content" });
        var created = await ReadBodyAsync<ResearchDocumentDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/research-document/{created!.Id}", new { FileName = "new.txt" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<ResearchDocumentDto>(updateResponse);
        updated!.FileName.Should().Be("new.txt");
        updated.Content.Should().Be("old content");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-document", new { FileName = "partial.txt", FileType = "text", Notes = "original note" });
        var created = await ReadBodyAsync<ResearchDocumentDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/research-document/{created!.Id}", new { Notes = "updated note" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<ResearchDocumentDto>(updateResponse);
        updated!.FileName.Should().Be("partial.txt");
        updated.Notes.Should().Be("updated note");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-document", new { FileName = "delete.txt", FileType = "text" });
        var created = await ReadBodyAsync<ResearchDocumentDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/research-document/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/research-document/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/research-document/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
