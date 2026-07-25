using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class NodePositionControllerIntegrationTests : ControllerTestBase
{
    public NodePositionControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Create_WithValidData_Returns201WithDto()
    {
        var response = await PostAsync($"/api/story/{StoryId}/node-position", new { NodeId = "char-1", NodeType = "character", X = 100.0, Y = 200.0 });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<NodePositionDto>(response);
        dto.Should().NotBeNull();
        dto!.NodeId.Should().Be("char-1");
        dto.NodeType.Should().Be("character");
        dto.X.Should().Be(100.0);
        dto.Y.Should().Be(200.0);
        dto.StoryId.Should().Be(StoryId);
        dto.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/node-position", new { NodeId = "n1", NodeType = "character", X = 0.0, Y = 0.0 });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var responseA = await PostAsync($"/api/story/{StoryId}/node-position", new { NodeId = "a", NodeType = "character", X = 1.0, Y = 2.0 });
        var responseB = await PostAsync($"/api/story/{StoryId}/node-position", new { NodeId = "b", NodeType = "location", X = 3.0, Y = 4.0 });
        responseA.StatusCode.Should().Be(HttpStatusCode.Created);
        responseB.StatusCode.Should().Be(HttpStatusCode.Created);

        var listResponse = await GetAsync($"/api/story/{StoryId}/node-position");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var nodes = await ReadBodyAsync<List<NodePositionDto>>(listResponse);
        nodes.Should().NotBeNull();
        nodes!.Select(n => n.NodeId).Should().Contain("a").And.Contain("b");
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/node-position", new { NodeId = "target", NodeType = "character", X = 50.0, Y = 75.0 });
        var created = await ReadBodyAsync<NodePositionDto>(createResponse);
        created.Should().NotBeNull();

        var getResponse = await GetAsync($"/api/story/{StoryId}/node-position/{created!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<NodePositionDto>(getResponse);
        dto.Should().NotBeNull();
        dto!.NodeId.Should().Be("target");
    }

    [Fact]
    public async Task GetById_WithWrongId_Returns404()
    {
        var response = await GetAsync($"/api/story/{StoryId}/node-position/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_WithValidData_ReturnsUpdatedDto()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/node-position", new { NodeId = "move", NodeType = "character", X = 0.0, Y = 0.0 });
        var created = await ReadBodyAsync<NodePositionDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/node-position/{created!.Id}", new { X = 150.0, Y = 250.0 });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<NodePositionDto>(updateResponse);
        updated!.X.Should().Be(150.0);
        updated.Y.Should().Be(250.0);
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/node-position", new { NodeId = "partial", NodeType = "character", X = 10.0, Y = 20.0 });
        var created = await ReadBodyAsync<NodePositionDto>(createResponse);

        var updateResponse = await PutAsync($"/api/story/{StoryId}/node-position/{created!.Id}", new { X = 99.0 });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await ReadBodyAsync<NodePositionDto>(updateResponse);
        updated!.X.Should().Be(99.0);
        updated.Y.Should().Be(20.0);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var createResponse = await PostAsync($"/api/story/{StoryId}/node-position", new { NodeId = "gone", NodeType = "character", X = 1.0, Y = 1.0 });
        var created = await ReadBodyAsync<NodePositionDto>(createResponse);

        var deleteResponse = await DeleteAsync($"/api/story/{StoryId}/node-position/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await GetAsync($"/api/story/{StoryId}/node-position/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_WithWrongId_Returns404()
    {
        var response = await DeleteAsync($"/api/story/{StoryId}/node-position/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
