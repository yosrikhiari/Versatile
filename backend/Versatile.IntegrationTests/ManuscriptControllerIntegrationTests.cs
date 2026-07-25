using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class ManuscriptControllerIntegrationTests : ControllerTestBase
{
    public ManuscriptControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/manuscript", new { Title = "Chapter 1", Content = "Full text...", WordCount = 500 });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<ManuscriptDto>(response);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Chapter 1");
        dto.Content.Should().Be("Full text...");
        dto.WordCount.Should().Be(500);
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMinimalData_Works()
    {
        var response = await PostAsync($"/api/story/{StoryId}/manuscript", new { Title = "Minimal" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<ManuscriptDto>(response);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Minimal");
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/manuscript", new { Title = "Orphan" });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/manuscript", new { Title = "B", WordCount = 200 });
        var responseB = await PostAsync($"/api/story/{StoryId}/manuscript", new { Title = "A", WordCount = 100 });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/manuscript");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var items = await ReadBodyAsync<List<ManuscriptDto>>(listResponse);
        items.Should().NotBeNull();
        items!.Count.Should().BeGreaterThanOrEqualTo(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/manuscript", new { Title = "Find Me" });
        var created = await ReadBodyAsync<ManuscriptDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/manuscript/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<ManuscriptDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/manuscript/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/manuscript", new { Title = "Old", WordCount = 100 });
        var created = await ReadBodyAsync<ManuscriptDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/manuscript/{created!.Id}", new { Title = "New" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<ManuscriptDto>(updateResponse);
        updated!.Title.Should().Be("New");
        updated.WordCount.Should().Be(100);
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/manuscript", new { Title = "Original", WordCount = 500 });
        var created = await ReadBodyAsync<ManuscriptDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/manuscript/{created!.Id}", new { WordCount = 1000 });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<ManuscriptDto>(updateResponse);
        updated!.Title.Should().Be("Original");
        updated.WordCount.Should().Be(1000);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/manuscript", new { Title = "To Delete" });
        var created = await ReadBodyAsync<ManuscriptDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/manuscript/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/manuscript/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/manuscript/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
