using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class PlotThreadControllerIntegrationTests : ControllerTestBase
{
    public PlotThreadControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var body = new { title = "Test Plot", status = "Active", notes = (string?)null, order = 1 };
        var response = await PostAsync($"/api/story/{StoryId}/plot-thread", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Post_WithMissingStory_ReturnsNotFound()
    {
        var body = new { title = "Test Plot", status = "Active", notes = (string?)null, order = 1 };
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/plot-thread", body);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsOk()
    {
        var response = await GetAsync($"/api/story/{StoryId}/plot-thread");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var body = new { title = "Test Plot", status = "Active", notes = (string?)null, order = 1 };
        var post = await PostAsync($"/api/story/{StoryId}/plot-thread", body);
        var created = await ReadBodyAsync<PlotThreadDto>(post);

        var response = await GetAsync($"/api/story/{StoryId}/plot-thread/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = await ReadBodyAsync<PlotThreadDto>(response);
        item!.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsNotFound()
    {
        var response = await GetAsync($"/api/story/{StoryId}/plot-thread/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsOk()
    {
        var body = new { title = "Test Plot", status = "Active", notes = (string?)null, order = 1 };
        var post = await PostAsync($"/api/story/{StoryId}/plot-thread", body);
        var created = await ReadBodyAsync<PlotThreadDto>(post);

        var update = new { title = "Updated", status = "Active", notes = (string?)null, order = 1 };
        var response = await PutAsync($"/api/story/{StoryId}/plot-thread/{created!.Id}", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var body = new { title = "Test Plot", status = "Active", notes = (string?)null, order = 1 };
        var post = await PostAsync($"/api/story/{StoryId}/plot-thread", body);
        var created = await ReadBodyAsync<PlotThreadDto>(post);

        var response = await DeleteAsync($"/api/story/{StoryId}/plot-thread/{created!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/plot-thread/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
