using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class AnnotationControllerIntegrationTests : ControllerTestBase
{
    public AnnotationControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/annotation", new CreateAnnotationRequest(0, "p1", "grammar", "Original text", "Suggested text", "Fix grammar", "pending"));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<AnnotationDto>(response);
        dto.Should().NotBeNull();
        dto!.ParagraphIndex.Should().Be(0);
        dto.ParagraphId.Should().Be("p1");
        dto.Type.Should().Be("grammar");
        dto.Original.Should().Be("Original text");
        dto.Suggestion.Should().Be("Suggested text");
        dto.Reason.Should().Be("Fix grammar");
        dto.Status.Should().Be("pending");
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var response = await PostAsync($"/api/story/{StoryId}/annotation", new CreateAnnotationRequest(0, null, "grammar", null, null, null, null));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<AnnotationDto>(response);
        dto.Should().NotBeNull();
        dto!.ParagraphId.Should().BeNull();
        dto.Original.Should().BeNull();
        dto.Suggestion.Should().BeNull();
        dto.Reason.Should().BeNull();
        dto.Status.Should().Be("pending");
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/annotation", new CreateAnnotationRequest(0, null, "grammar", null, null, null, null));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByCreatedAtDesc()
    {
        var first = await PostAsync($"/api/story/{StoryId}/annotation", new CreateAnnotationRequest(0, null, "grammar", null, null, null, null));
        first.StatusCode.Should().Be(HttpStatusCode.Created);
        await Task.Delay(10);
        var second = await PostAsync($"/api/story/{StoryId}/annotation", new CreateAnnotationRequest(1, null, "style", null, null, null, null));
        second.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/annotation");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var annotations = await ReadBodyAsync<List<AnnotationDto>>(listResponse);
        annotations.Should().NotBeNull();
        annotations!.Select(a => a.ParagraphIndex).Should().Equal(1, 0);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/annotation", new CreateAnnotationRequest(0, null, "grammar", "Find Me", null, null, null));
        var created = await ReadBodyAsync<AnnotationDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/annotation/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<AnnotationDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Original.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/annotation/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/annotation", new CreateAnnotationRequest(0, "p1", "grammar", "Original", "Suggestion", "Reason", "pending"));
        var created = await ReadBodyAsync<AnnotationDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/annotation/{created!.Id}", new UpdateAnnotationRequest(1, "p2", "style", "New original", "New suggestion", "New reason", "resolved"));
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<AnnotationDto>(updateResponse);
        updated!.ParagraphIndex.Should().Be(1);
        updated.ParagraphId.Should().Be("p2");
        updated.Type.Should().Be("style");
        updated.Original.Should().Be("New original");
        updated.Suggestion.Should().Be("New suggestion");
        updated.Reason.Should().Be("New reason");
        updated.Status.Should().Be("resolved");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/annotation", new CreateAnnotationRequest(0, "p1", "grammar", "Original", "Suggestion", "Reason", "pending"));
        var created = await ReadBodyAsync<AnnotationDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/annotation/{created!.Id}", new UpdateAnnotationRequest(5, null, null, null, null, null, null));
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<AnnotationDto>(updateResponse);
        updated!.ParagraphIndex.Should().Be(5);
        updated.ParagraphId.Should().Be("p1");
        updated.Type.Should().Be("grammar");
        updated.Original.Should().Be("Original");
        updated.Suggestion.Should().Be("Suggestion");
        updated.Reason.Should().Be("Reason");
        updated.Status.Should().Be("pending");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/annotation", new CreateAnnotationRequest(0, null, "grammar", null, null, null, null));
        var created = await ReadBodyAsync<AnnotationDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/annotation/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/annotation/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/annotation/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
