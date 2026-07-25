using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class GeneratedStoryControllerIntegrationTests : ControllerTestBase
{
    public GeneratedStoryControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/generated-story", new { Title = "AI Story", Content = "Once upon a time...", TotalWords = 500, QualityScore = 0.95 });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<GeneratedStoryDto>(response);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("AI Story");
        dto.Content.Should().Be("Once upon a time...");
        dto.TotalWords.Should().Be(500);
        dto.QualityScore.Should().Be(0.95);
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMinimalData_Works()
    {
        var response = await PostAsync($"/api/story/{StoryId}/generated-story", new { Title = "Minimal", TotalWords = 100 });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<GeneratedStoryDto>(response);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Minimal");
        dto.TotalWords.Should().Be(100);
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/generated-story", new { Title = "Orphan", TotalWords = 0 });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/generated-story", new { Title = "First", TotalWords = 200 });
        var responseB = await PostAsync($"/api/story/{StoryId}/generated-story", new { Title = "Second", TotalWords = 300 });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/generated-story");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var stories = await ReadBodyAsync<List<GeneratedStoryDto>>(listResponse);
        stories.Should().NotBeNull();
        stories!.Select(s => s.Title).Should().Contain("First").And.Contain("Second");
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/generated-story", new { Title = "Find Me", TotalWords = 150 });
        var created = await ReadBodyAsync<GeneratedStoryDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/generated-story/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<GeneratedStoryDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/generated-story/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/generated-story", new { Title = "Old Title", Content = "Old content", TotalWords = 100 });
        var created = await ReadBodyAsync<GeneratedStoryDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/generated-story/{created!.Id}", new { Title = "New Title" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<GeneratedStoryDto>(updateResponse);
        updated!.Title.Should().Be("New Title");
        updated.Content.Should().Be("Old content");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/generated-story", new { Title = "Original", Content = "Original content", TotalWords = 250 });
        var created = await ReadBodyAsync<GeneratedStoryDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/generated-story/{created!.Id}", new { TotalWords = 999 });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<GeneratedStoryDto>(updateResponse);
        updated!.Title.Should().Be("Original");
        updated.TotalWords.Should().Be(999);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/generated-story", new { Title = "To Delete", TotalWords = 50 });
        var created = await ReadBodyAsync<GeneratedStoryDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/generated-story/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/generated-story/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/generated-story/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
