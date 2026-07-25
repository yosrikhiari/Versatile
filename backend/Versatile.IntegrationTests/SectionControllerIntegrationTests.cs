using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class SectionControllerIntegrationTests : ControllerTestBase
{
    public SectionControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/section", new { Title = "Opening", Content = "Once upon a time...", Status = "draft" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<SectionDto>(response);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Opening");
        dto.Content.Should().Be("Once upon a time...");
        dto.Status.Should().Be("draft");
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMinimalData_Works()
    {
        var response = await PostAsync($"/api/story/{StoryId}/section", new { Title = "Minimal" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<SectionDto>(response);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Minimal");
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/section", new { Title = "Orphan" });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/section", new { Title = "A" });
        var responseB = await PostAsync($"/api/story/{StoryId}/section", new { Title = "B" });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/section");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var sections = await ReadBodyAsync<List<SectionDto>>(listResponse);
        sections.Should().NotBeNull();
        sections!.Select(s => s.Title).Should().Contain("A").And.Contain("B");
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/section", new { Title = "Find Me" });
        var created = await ReadBodyAsync<SectionDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/section/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<SectionDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/section/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/section", new { Title = "Old", Content = "Old content" });
        var created = await ReadBodyAsync<SectionDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/section/{created!.Id}", new { Title = "New" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<SectionDto>(updateResponse);
        updated!.Title.Should().Be("New");
        updated.Content.Should().Be("Old content");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/section", new { Title = "Original", Content = "Original content" });
        var created = await ReadBodyAsync<SectionDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/section/{created!.Id}", new { Content = "Updated content" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<SectionDto>(updateResponse);
        updated!.Title.Should().Be("Original");
        updated.Content.Should().Be("Updated content");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/section", new { Title = "To Delete" });
        var created = await ReadBodyAsync<SectionDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/section/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/section/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/section/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
