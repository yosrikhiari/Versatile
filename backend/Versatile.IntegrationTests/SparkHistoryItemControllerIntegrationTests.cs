using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class SparkHistoryItemControllerIntegrationTests : ControllerTestBase
{
    public SparkHistoryItemControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/spark-history-item", new { Type = "prompt", Prompt = "Write a story", Blueprint = "outline", GeneratedContent = "Once upon a..." });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<SparkHistoryItemDto>(response);
        dto.Should().NotBeNull();
        dto!.Type.Should().Be("prompt");
        dto.Prompt.Should().Be("Write a story");
        dto.Blueprint.Should().Be("outline");
        dto.GeneratedContent.Should().Be("Once upon a...");
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMinimalData_Works()
    {
        var response = await PostAsync($"/api/story/{StoryId}/spark-history-item", new { Type = "note" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<SparkHistoryItemDto>(response);
        dto.Should().NotBeNull();
        dto!.Type.Should().Be("note");
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/spark-history-item", new { Type = "orphan" });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/spark-history-item", new { Type = "idea", Prompt = "Idea A" });
        var responseB = await PostAsync($"/api/story/{StoryId}/spark-history-item", new { Type = "idea", Prompt = "Idea B" });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/spark-history-item");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var items = await ReadBodyAsync<List<SparkHistoryItemDto>>(listResponse);
        items.Should().NotBeNull();
        items!.Select(i => i.Prompt).Should().Contain("Idea A").And.Contain("Idea B");
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/spark-history-item", new { Type = "prompt", Prompt = "Findable spark" });
        var created = await ReadBodyAsync<SparkHistoryItemDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/spark-history-item/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<SparkHistoryItemDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Prompt.Should().Be("Findable spark");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/spark-history-item/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/spark-history-item", new { Type = "original", Prompt = "old prompt" });
        var created = await ReadBodyAsync<SparkHistoryItemDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/spark-history-item/{created!.Id}", new { Type = "updated" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<SparkHistoryItemDto>(updateResponse);
        updated!.Type.Should().Be("updated");
        updated.Prompt.Should().Be("old prompt");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/spark-history-item", new { Type = "note", Prompt = "original", Blueprint = "bp" });
        var created = await ReadBodyAsync<SparkHistoryItemDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/spark-history-item/{created!.Id}", new { Blueprint = "updated bp" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<SparkHistoryItemDto>(updateResponse);
        updated!.Type.Should().Be("note");
        updated.Blueprint.Should().Be("updated bp");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/spark-history-item", new { Type = "delete-me" });
        var created = await ReadBodyAsync<SparkHistoryItemDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/spark-history-item/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/spark-history-item/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/spark-history-item/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
