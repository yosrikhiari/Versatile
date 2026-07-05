using Moq;
using OpenAI.Chat;
using Versatile.Application.DTOs;
using Versatile.Application.Services;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Tests.Infrastructure;

public class AiGenerationServiceTests
{
    [Fact]
    public void BuildContinuationPrompt_IncludesRecentContent()
    {
        var request = new GenerateContinuationRequest("s1", "Main content", null, null, null);

        var result = AiGenerationService.BuildContinuationPrompt(request);

        Assert.Contains("Main content", result);
    }

    [Fact]
    public void BuildContinuationPrompt_OmitsNullFields()
    {
        var request = new GenerateContinuationRequest("s1", "Content", null, null, null);

        var result = AiGenerationService.BuildContinuationPrompt(request);

        Assert.DoesNotContain("Style:", result);
        Assert.DoesNotContain("Tone:", result);
        Assert.DoesNotContain("Genre:", result);
    }

    [Fact]
    public void BuildContinuationPrompt_IncludesAllFields()
    {
        var request = new GenerateContinuationRequest("s1", "Content", "Fantasy", "Dark", "Prosaic");

        var result = AiGenerationService.BuildContinuationPrompt(request);

        Assert.Contains("Fantasy", result);
        Assert.Contains("Dark", result);
        Assert.Contains("Prosaic", result);
    }

    [Fact]
    public void BuildSuggestionPrompt_IncludesAllFields()
    {
        var request = new GenerateSuggestionRequest("s1", "Scene where hero meets villain", "Plot twist");

        var result = AiGenerationService.BuildSuggestionPrompt(request);

        Assert.Contains("Scene where hero meets villain", result);
        Assert.Contains("Plot twist", result);
    }

    [Fact]
    public void BuildCharacterProfilePrompt_IncludesAllFields()
    {
        var request = new GenerateCharacterProfileRequest("s1", "Hero", "Wise mentor", "Guide");

        var result = AiGenerationService.BuildCharacterProfilePrompt(request);

        Assert.Contains("Hero", result);
        Assert.Contains("Wise mentor", result);
        Assert.Contains("Guide", result);
    }

    [Fact]
    public async Task GenerateStoryContinuationAsync_YieldsChunks()
    {
        var mockStreamer = new Mock<IChatStreamer>();
        var updates = new List<StreamingChatCompletionUpdate>
        {
            StreamingChatUpdateFactory.Create("Hello "),
            StreamingChatUpdateFactory.Create("world!"),
        };
        mockStreamer.Setup(s => s.CompleteChatStreamingAsync(
                It.IsAny<IEnumerable<ChatMessage>>(),
                It.IsAny<CancellationToken>()))
            .Returns(updates.ToAsyncEnumerable());

        var service = new AiGenerationService(mockStreamer.Object);
        var request = new GenerateContinuationRequest("s1", "Test content", null, null, null);

        var chunks = await service.GenerateStoryContinuationAsync(request).ToListAsync();

        Assert.Equal(2, chunks.Count);
        Assert.Equal("Hello ", chunks[0]);
        Assert.Equal("world!", chunks[1]);
    }

    [Fact]
    public async Task GenerateStoryContinuationAsync_SkipsNullContent()
    {
        var mockStreamer = new Mock<IChatStreamer>();
        var updates = new List<StreamingChatCompletionUpdate>
        {
            StreamingChatUpdateFactory.Create("text"),
            StreamingChatUpdateFactory.Create(""),
        };
        mockStreamer.Setup(s => s.CompleteChatStreamingAsync(
                It.IsAny<IEnumerable<ChatMessage>>(),
                It.IsAny<CancellationToken>()))
            .Returns(updates.ToAsyncEnumerable());

        var service = new AiGenerationService(mockStreamer.Object);
        var request = new GenerateContinuationRequest("s1", "Test", null, null, null);

        var chunks = await service.GenerateStoryContinuationAsync(request).ToListAsync();

        Assert.Single(chunks);
        Assert.Equal("text", chunks[0]);
    }

    [Fact]
    public void GenerateStoryContinuationAsync_ThrowsOnNullStreamer()
    {
        Assert.Throws<ArgumentNullException>(() => new AiGenerationService(null!));
    }
}
