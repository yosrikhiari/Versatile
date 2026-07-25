using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class DebugResearchChunkTests : ControllerTestBase
{
    public DebugResearchChunkTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Debug_Create_Returns201WithDto()
    {
        var docResponse = await PostAsync($"/api/story/{StoryId}/research-document", new { FileName = "source.txt", FileType = "text" });
        var docBody = await docResponse.Content.ReadAsStringAsync();
        var doc = await ReadBodyAsync<ResearchDocumentDto>(docResponse);

        var response = await PostAsync($"/api/story/{StoryId}/research-chunk", new { DocumentId = doc!.Id, ChunkIndex = 1, Content = "chunk content", Embedding = "vec" });
        var body = await response.Content.ReadAsStringAsync();

        response.StatusCode.Should().Be(HttpStatusCode.Created, $"Body: {body}");
    }
}
