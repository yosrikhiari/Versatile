using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class SnippetControllerIntegrationTests : ControllerTestBase
{
    public SnippetControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/snippet", new { Word = "hello", Count = 3, LastSeen = DateTime.UtcNow });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<SnippetDto>(response);
        dto.Should().NotBeNull();
        dto!.Word.Should().Be("hello");
        dto.Count.Should().Be(3);
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/snippet", new { Word = "orphan", Count = 1 });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/snippet", new { Word = "foo", Count = 1 });
        var responseB = await PostAsync($"/api/story/{StoryId}/snippet", new { Word = "bar", Count = 2 });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/snippet");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var snippets = await ReadBodyAsync<List<SnippetDto>>(listResponse);
        snippets.Should().NotBeNull();
        snippets!.Select(s => s.Word).Should().Contain("foo").And.Contain("bar");
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/snippet", new { Word = "unique", Count = 7 });
        var created = await ReadBodyAsync<SnippetDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/snippet/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<SnippetDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Word.Should().Be("unique");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/snippet/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/snippet", new { Word = "word", Count = 1 });
        var created = await ReadBodyAsync<SnippetDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/snippet/{created!.Id}", new { Count = 10 });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<SnippetDto>(updateResponse);
        updated!.Count.Should().Be(10);
    }

    [Fact]
    public async Task Update_Count_ReflectsInGet()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/snippet", new { Word = "counter", Count = 3 });
        var created = await ReadBodyAsync<SnippetDto>(createResponse);

        await PutAsync($"/api/story/{StoryId}/snippet/{created!.Id}", new { Count = 42 });

        var getResponse = await GetAsync($"/api/story/{StoryId}/snippet/{created.Id}");
        var updated = await ReadBodyAsync<SnippetDto>(getResponse);
        updated!.Count.Should().Be(42);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/snippet", new { Word = "delete-me", Count = 1 });
        var created = await ReadBodyAsync<SnippetDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/snippet/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/snippet/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/snippet/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
