using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class DailyGoalControllerIntegrationTests : ControllerTestBase
{
    public DailyGoalControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var date = DateTime.UtcNow.Date;
        var response = await PostAsync($"/api/story/{StoryId}/daily-goal", new { Date = date, TargetWords = 1000 });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<DailyGoalDto>(response);
        dto.Should().NotBeNull();
        dto!.Date.Should().Be(date);
        dto.TargetWords.Should().Be(1000);
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_DefaultsCurrentWordsAndCompleted()
    {
        var date = DateTime.UtcNow.Date;
        var response = await PostAsync($"/api/story/{StoryId}/daily-goal", new { Date = date, TargetWords = 500 });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<DailyGoalDto>(response);
        dto.Should().NotBeNull();
        dto!.TargetWords.Should().Be(500);
        dto.CurrentWords.Should().Be(0);
        dto.Completed.Should().BeFalse();
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/daily-goal", new { Date = DateTime.UtcNow.Date, TargetWords = 1000 });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var date = DateTime.UtcNow.Date;
        var responseA = await PostAsync($"/api/story/{StoryId}/daily-goal", new { Date = date, TargetWords = 500 });
        var responseB = await PostAsync($"/api/story/{StoryId}/daily-goal", new { Date = date.AddDays(1), TargetWords = 1000 });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/daily-goal");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var items = await ReadBodyAsync<List<DailyGoalDto>>(listResponse);
        items.Should().NotBeNull();
        items!.Count.Should().BeGreaterThanOrEqualTo(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var date = DateTime.UtcNow.Date;
        var createResponse = await PostAsync($"/api/story/{StoryId}/daily-goal", new { Date = date, TargetWords = 777 });
        var created = await ReadBodyAsync<DailyGoalDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/daily-goal/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<DailyGoalDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.TargetWords.Should().Be(777);
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/daily-goal/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var date = DateTime.UtcNow.Date;
        var createResponse = await PostAsync($"/api/story/{StoryId}/daily-goal", new { Date = date, TargetWords = 500 });
        var created = await ReadBodyAsync<DailyGoalDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/daily-goal/{created!.Id}", new { TargetWords = 2000 });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<DailyGoalDto>(updateResponse);
        updated!.TargetWords.Should().Be(2000);
    }

    [Fact]
    public async Task Update_WithCompleted_ReflectsInGet()
    {
        var date = DateTime.UtcNow.Date;
        var createResponse = await PostAsync($"/api/story/{StoryId}/daily-goal", new { Date = date, TargetWords = 1000 });
        var created = await ReadBodyAsync<DailyGoalDto>(createResponse);

        await PutAsync($"/api/story/{StoryId}/daily-goal/{created!.Id}", new { Completed = true });

        var getResponse = await GetAsync($"/api/story/{StoryId}/daily-goal/{created.Id}");
        var updated = await ReadBodyAsync<DailyGoalDto>(getResponse);
        updated!.Completed.Should().BeTrue();
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var date = DateTime.UtcNow.Date;
        var createResponse = await PostAsync($"/api/story/{StoryId}/daily-goal", new { Date = date, TargetWords = 333 });
        var created = await ReadBodyAsync<DailyGoalDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/daily-goal/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/daily-goal/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/daily-goal/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
