using System.Net;
using FluentAssertions;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class StoryControllerIntegrationTests : ControllerTestBase
{
    public StoryControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { title = "Test Story", premise = "A test", genre = "Fantasy" };
        var response = await PostAsync("/api/Story", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var item = await ReadBodyAsync<StoryDto>(response);
        item.Should().NotBeNull();
        item!.Title.Should().Be("Test Story");
    }

    [Fact]
    public async Task Post_WithMissingTitle_ReturnsBadRequest()
    {
        var body = new { };
        var response = await PostAsync("/api/Story", body);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        await PostAsync("/api/Story", new { title = "Story A" });
        await PostAsync("/api/Story", new { title = "Story B" });

        var response = await GetAsync("/api/Story");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var paged = await ReadBodyAsync<PagedResponse<StoryDto>>(response);
        paged.Should().NotBeNull();
        paged!.Items.Should().HaveCountGreaterThanOrEqualTo(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var post = await PostAsync("/api/Story", new { title = "Test Story" });
        var created = await ReadBodyAsync<StoryDto>(post);

        var response = await GetAsync($"/api/Story/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<StoryDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/Story/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsUpdatedDto()
    {
        var post = await PostAsync("/api/Story", new { title = "Original" });
        var created = await ReadBodyAsync<StoryDto>(post);

        var update = new { title = "Updated Title", genre = "Sci-Fi" };
        var response = await PutAsync($"/api/Story/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<StoryDto>(response);
        item!.Title.Should().Be("Updated Title");
    }

    [Fact]
    public async Task Put_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var post = await PostAsync("/api/Story", new { title = "Original", premise = "Original premise", genre = "Fantasy" });
        var created = await ReadBodyAsync<StoryDto>(post);

        var update = new { title = "New Title" };
        var response = await PutAsync($"/api/Story/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<StoryDto>(response);
        item!.Title.Should().Be("New Title");
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var post = await PostAsync("/api/Story", new { title = "To Delete" });
        var created = await ReadBodyAsync<StoryDto>(post);

        var response = await DeleteAsync($"/api/Story/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/Story/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
