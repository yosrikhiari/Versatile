using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class VolumeControllerIntegrationTests : ControllerTestBase
{
    public VolumeControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { title = "Test Volume" };
        var response = await PostAsync($"/api/story/{StoryId}/volume", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { title = "Test Volume" };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/volume", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/volume");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { title = "Test Volume" };
        var post = await PostAsync($"/api/story/{StoryId}/volume", body);
        var created = await ReadBodyAsync<VolumeDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/volume/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<VolumeDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/volume/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { title = "Test Volume" };
        var post = await PostAsync($"/api/story/{StoryId}/volume", body);
        var created = await ReadBodyAsync<VolumeDto>(post);

        var update = new { title = "Updated Volume" };
        var response = await PutAsync($"/api/story/{StoryId}/volume/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { title = "Test Volume" };
        var post = await PostAsync($"/api/story/{StoryId}/volume", body);
        var created = await ReadBodyAsync<VolumeDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/volume/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/volume/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
