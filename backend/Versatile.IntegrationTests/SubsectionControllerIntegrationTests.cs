using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class SubsectionControllerIntegrationTests : ControllerTestBase
{
    public SubsectionControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    private async Task<Guid> CreateSectionAsync()
    {
        var sectionResponse = await PostAsync($"/api/story/{StoryId}/section", new { Title = "Parent Section" });
        var section = await ReadBodyAsync<SectionDto>(sectionResponse);
        return section!.Id;
    }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var sectionId = await CreateSectionAsync();
        var response = await PostAsync($"/api/story/{StoryId}/subsection", new { SectionId = sectionId, Title = "My Subsection", Summary = "A summary", Content = "Some content", Tags = "important" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<SubsectionDto>(response);
        dto.Should().NotBeNull();
        dto!.SectionId.Should().Be(sectionId);
        dto.Title.Should().Be("My Subsection");
        dto.Summary.Should().Be("A summary");
        dto.Content.Should().Be("Some content");
        dto.Tags.Should().Be("important");
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMinimalData_Works()
    {
        var sectionId = await CreateSectionAsync();
        var response = await PostAsync($"/api/story/{StoryId}/subsection", new { SectionId = sectionId, Title = "Minimal" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<SubsectionDto>(response);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Minimal");
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/subsection", new { SectionId = Guid.NewGuid(), Title = "Orphan" });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var sectionId = await CreateSectionAsync();
        var responseA = await PostAsync($"/api/story/{StoryId}/subsection", new { SectionId = sectionId, Title = "Alpha" });
        var responseB = await PostAsync($"/api/story/{StoryId}/subsection", new { SectionId = sectionId, Title = "Beta" });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/subsection");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var subsections = await ReadBodyAsync<List<SubsectionDto>>(listResponse);
        subsections.Should().NotBeNull();
        subsections!.Select(s => s.Title).Should().Contain("Alpha").And.Contain("Beta");
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var sectionId = await CreateSectionAsync();
        var createResponse = await PostAsync($"/api/story/{StoryId}/subsection", new { SectionId = sectionId, Title = "Find Me" });
        var created = await ReadBodyAsync<SubsectionDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/subsection/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<SubsectionDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/subsection/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var sectionId = await CreateSectionAsync();
        var createResponse = await PostAsync($"/api/story/{StoryId}/subsection", new { SectionId = sectionId, Title = "Old", Content = "Old content" });
        var created = await ReadBodyAsync<SubsectionDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/subsection/{created!.Id}", new { Title = "Updated" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<SubsectionDto>(updateResponse);
        updated!.Title.Should().Be("Updated");
        updated.Content.Should().Be("Old content");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var sectionId = await CreateSectionAsync();
        var createResponse = await PostAsync($"/api/story/{StoryId}/subsection", new { SectionId = sectionId, Title = "Original", Summary = "A summary" });
        var created = await ReadBodyAsync<SubsectionDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/subsection/{created!.Id}", new { Summary = "Updated summary" });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<SubsectionDto>(updateResponse);
        updated!.Title.Should().Be("Original");
        updated.Summary.Should().Be("Updated summary");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var sectionId = await CreateSectionAsync();
        var createResponse = await PostAsync($"/api/story/{StoryId}/subsection", new { SectionId = sectionId, Title = "To Delete" });
        var created = await ReadBodyAsync<SubsectionDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/subsection/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/subsection/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/subsection/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
