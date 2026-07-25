using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class RevisionCommentControllerIntegrationTests : ControllerTestBase
{
    public RevisionCommentControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/revision-comment", new { ParagraphIndex = 0, StartOffset = 5, EndOffset = 10, SelectedText = "old", Comment = "rewrite this", Resolved = false });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<RevisionCommentDto>(response);
        dto.Should().NotBeNull();
        dto!.ParagraphIndex.Should().Be(0);
        dto.StartOffset.Should().Be(5);
        dto.EndOffset.Should().Be(10);
        dto.SelectedText.Should().Be("old");
        dto.Comment.Should().Be("rewrite this");
        dto.Resolved.Should().BeFalse();
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMinimalData_Works()
    {
        var response = await PostAsync($"/api/story/{StoryId}/revision-comment", new { ParagraphIndex = 1, StartOffset = 0, EndOffset = 0 });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<RevisionCommentDto>(response);
        dto.Should().NotBeNull();
        dto!.ParagraphIndex.Should().Be(1);
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/revision-comment", new { ParagraphIndex = 0, StartOffset = 0, EndOffset = 0 });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/revision-comment", new { ParagraphIndex = 0, StartOffset = 0, EndOffset = 5, Comment = "A" });
        var responseB = await PostAsync($"/api/story/{StoryId}/revision-comment", new { ParagraphIndex = 1, StartOffset = 0, EndOffset = 5, Comment = "B" });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/revision-comment");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var comments = await ReadBodyAsync<List<RevisionCommentDto>>(listResponse);
        comments.Should().NotBeNull();
        comments!.Select(c => c.Comment).Should().Contain("A").And.Contain("B");
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/revision-comment", new { ParagraphIndex = 2, StartOffset = 3, EndOffset = 8, Comment = "fix this" });
        var created = await ReadBodyAsync<RevisionCommentDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/revision-comment/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<RevisionCommentDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Comment.Should().Be("fix this");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/revision-comment/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/revision-comment", new { ParagraphIndex = 0, StartOffset = 0, EndOffset = 3, Comment = "old comment" });
        var created = await ReadBodyAsync<RevisionCommentDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/revision-comment/{created!.Id}", new { Comment = "updated comment" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<RevisionCommentDto>(updateResponse);
        updated!.Comment.Should().Be("updated comment");
    }

    [Fact]
    public async Task Update_Resolved_ReflectsInGet()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/revision-comment", new { ParagraphIndex = 0, StartOffset = 1, EndOffset = 2, Resolved = false });
        var created = await ReadBodyAsync<RevisionCommentDto>(createResponse);

        await PutAsync($"/api/story/{StoryId}/revision-comment/{created!.Id}", new { Resolved = true });

        var getResponse = await GetAsync($"/api/story/{StoryId}/revision-comment/{created.Id}");
        var updated = await ReadBodyAsync<RevisionCommentDto>(getResponse);
        updated!.Resolved.Should().BeTrue();
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/revision-comment", new { ParagraphIndex = 0, StartOffset = 0, EndOffset = 1 });
        var created = await ReadBodyAsync<RevisionCommentDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/revision-comment/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/revision-comment/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/revision-comment/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
