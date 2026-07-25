using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class ResearchChunkControllerIntegrationTests : ControllerTestBase
{
    public ResearchChunkControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    private async Task<Guid> CreateDocumentAsync()
    {
        var docResponse = await PostAsync($"/api/story/{StoryId}/research-document", new { FileName = "source.txt", FileType = "text" });
        var doc = await ReadBodyAsync<ResearchDocumentDto>(docResponse);
        return doc!.Id;
    }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var documentId = await CreateDocumentAsync();
        var response = await PostAsync($"/api/story/{StoryId}/research-chunk", new { DocumentId = documentId, ChunkIndex = 1, Content = "chunk content", Embedding = "vec" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<ResearchChunkDto>(response);
        dto.Should().NotBeNull();
        dto!.DocumentId.Should().Be(documentId);
        dto.ChunkIndex.Should().Be(1);
        dto.Content.Should().Be("chunk content");
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMinimalData_Works()
    {
        var documentId = await CreateDocumentAsync();
        var response = await PostAsync($"/api/story/{StoryId}/research-chunk", new { DocumentId = documentId, ChunkIndex = 0 });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<ResearchChunkDto>(response);
        dto.Should().NotBeNull();
        dto!.ChunkIndex.Should().Be(0);
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/research-chunk", new { DocumentId = Guid.NewGuid(), ChunkIndex = 0 });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var documentId = await CreateDocumentAsync();
        var responseA = await PostAsync($"/api/story/{StoryId}/research-chunk", new { DocumentId = documentId, ChunkIndex = 1 });
        var responseB = await PostAsync($"/api/story/{StoryId}/research-chunk", new { DocumentId = documentId, ChunkIndex = 2 });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/research-chunk");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var chunks = await ReadBodyAsync<List<ResearchChunkDto>>(listResponse);
        chunks.Should().NotBeNull();
        chunks!.Select(c => c.ChunkIndex).Should().Contain(1).And.Contain(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var documentId = await CreateDocumentAsync();
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-chunk", new { DocumentId = documentId, ChunkIndex = 5, Content = "findable" });
        var created = await ReadBodyAsync<ResearchChunkDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/research-chunk/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<ResearchChunkDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Content.Should().Be("findable");
        dto.ChunkIndex.Should().Be(5);
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/research-chunk/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var documentId = await CreateDocumentAsync();
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-chunk", new { DocumentId = documentId, ChunkIndex = 1, Content = "old" });
        var created = await ReadBodyAsync<ResearchChunkDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/research-chunk/{created!.Id}", new { Content = "new" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<ResearchChunkDto>(updateResponse);
        updated!.Content.Should().Be("new");
        updated.ChunkIndex.Should().Be(1);
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var documentId = await CreateDocumentAsync();
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-chunk", new { DocumentId = documentId, ChunkIndex = 3, Content = "original" });
        var created = await ReadBodyAsync<ResearchChunkDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/research-chunk/{created!.Id}", new { ChunkIndex = 99 });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<ResearchChunkDto>(updateResponse);
        updated!.ChunkIndex.Should().Be(99);
        updated.Content.Should().Be("original");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var documentId = await CreateDocumentAsync();
        var createResponse = await PostAsync($"/api/story/{StoryId}/research-chunk", new { DocumentId = documentId, ChunkIndex = 7 });
        var created = await ReadBodyAsync<ResearchChunkDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/research-chunk/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/research-chunk/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/research-chunk/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
