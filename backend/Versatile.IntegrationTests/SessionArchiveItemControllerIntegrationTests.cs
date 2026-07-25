using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class SessionArchiveItemControllerIntegrationTests : ControllerTestBase
{
    public SessionArchiveItemControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var timestamp = DateTime.UtcNow;
        var response = await PostAsync($"/api/session-archive-item?storyId={StoryId}", new { Signal = "test-signal", Type = "info", Timestamp = timestamp, Data = "some data" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<SessionArchiveItemDto>(response);
        dto.Should().NotBeNull();
        dto!.Signal.Should().Be("test-signal");
        dto.Type.Should().Be("info");
        dto.Data.Should().Be("some data");
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMinimalData_Works()
    {
        var timestamp = DateTime.UtcNow;
        var response = await PostAsync($"/api/session-archive-item?storyId={StoryId}", new { Signal = "minimal", Type = "event", Timestamp = timestamp });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<SessionArchiveItemDto>(response);
        dto.Should().NotBeNull();
        dto!.Signal.Should().Be("minimal");
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/session-archive-item?storyId={Guid.NewGuid()}", new { Signal = "orphan", Type = "test", Timestamp = DateTime.UtcNow });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var timestamp = DateTime.UtcNow;
        var responseA = await PostAsync($"/api/session-archive-item?storyId={StoryId}", new { Signal = "sig-a", Type = "info", Timestamp = timestamp });
        var responseB = await PostAsync($"/api/session-archive-item?storyId={StoryId}", new { Signal = "sig-b", Type = "warn", Timestamp = timestamp });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/session-archive-item?storyId={StoryId}");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var items = await ReadBodyAsync<List<SessionArchiveItemDto>>(listResponse);
        items.Should().NotBeNull();
        items!.Select(i => i.Signal).Should().Contain("sig-a").And.Contain("sig-b");
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var timestamp = DateTime.UtcNow;
        var createResponse = await PostAsync($"/api/session-archive-item?storyId={StoryId}", new { Signal = "findable", Type = "log", Timestamp = timestamp });
        var created = await ReadBodyAsync<SessionArchiveItemDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/session-archive-item/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<SessionArchiveItemDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Signal.Should().Be("findable");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/session-archive-item/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var timestamp = DateTime.UtcNow;
        var createResponse = await PostAsync($"/api/session-archive-item?storyId={StoryId}", new { Signal = "old", Type = "info", Timestamp = timestamp, Data = "old data" });
        var created = await ReadBodyAsync<SessionArchiveItemDto>(createResponse);

        var updateResponse = await PutAsync($"/api/session-archive-item/{created!.Id}", new { Signal = "updated" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<SessionArchiveItemDto>(updateResponse);
        updated!.Signal.Should().Be("updated");
        updated.Data.Should().Be("old data");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var timestamp = DateTime.UtcNow;
        var createResponse = await PostAsync($"/api/session-archive-item?storyId={StoryId}", new { Signal = "original", Type = "info", Timestamp = timestamp, Data = "some data" });
        var created = await ReadBodyAsync<SessionArchiveItemDto>(createResponse);

        var updateResponse = await PutAsync($"/api/session-archive-item/{created!.Id}", new { Data = "new data" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<SessionArchiveItemDto>(updateResponse);
        updated!.Signal.Should().Be("original");
        updated.Data.Should().Be("new data");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var timestamp = DateTime.UtcNow;
        var createResponse = await PostAsync($"/api/session-archive-item?storyId={StoryId}", new { Signal = "to-delete", Type = "info", Timestamp = timestamp });
        var created = await ReadBodyAsync<SessionArchiveItemDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/session-archive-item/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/session-archive-item/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/session-archive-item/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
