using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class SceneControllerIntegrationTests : ControllerTestBase
{
    public SceneControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    private async Task<Guid> CreateTestChapterAsync()
    {
        var body = new { title = "Test Chapter", order = 1 };
        var response = await PostAsync($"/api/story/{StoryId}/chapter", body);
        var created = await ReadBodyAsync<ChapterDto>(response);
        return created!.Id;
    }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var chapterId = await CreateTestChapterAsync();
        var body = new { title = "Test Scene", content = "Test content", order = 1 };
        var response = await PostAsync($"/api/chapter/{chapterId}/scene", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingChapter_ReturnsNotFound()
    {
        var body = new { title = "Test Scene", content = "Test content", order = 1 };
        var response = await PostAsync($"/api/chapter/{Guid.NewGuid()}/scene", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var chapterId = await CreateTestChapterAsync();
        var response = await GetAsync($"/api/chapter/{chapterId}/scene");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var chapterId = await CreateTestChapterAsync();
        var body = new { title = "Test Scene", content = "Test content", order = 1 };
        var post = await PostAsync($"/api/chapter/{chapterId}/scene", body);
        var created = await ReadBodyAsync<SceneDto>(post);

        var response = await GetAsync($"/api/chapter/{chapterId}/scene/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<SceneDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var chapterId = await CreateTestChapterAsync();
        var response = await GetAsync($"/api/chapter/{chapterId}/scene/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var chapterId = await CreateTestChapterAsync();
        var body = new { title = "Test Scene", content = "Test content", order = 1 };
        var post = await PostAsync($"/api/chapter/{chapterId}/scene", body);
        var created = await ReadBodyAsync<SceneDto>(post);

        var update = new { title = "Updated Scene" };
        var response = await PutAsync($"/api/chapter/{chapterId}/scene/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var chapterId = await CreateTestChapterAsync();
        var body = new { title = "Test Scene", content = "Test content", order = 1 };
        var post = await PostAsync($"/api/chapter/{chapterId}/scene", body);
        var created = await ReadBodyAsync<SceneDto>(post);

        var response = await DeleteAsync($"/api/chapter/{chapterId}/scene/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var chapterId = await CreateTestChapterAsync();
        var response = await DeleteAsync($"/api/chapter/{chapterId}/scene/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
