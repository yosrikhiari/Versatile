using Moq;
using Versatile.Application.DTOs;
using Versatile.Application.Services;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Tests.Infrastructure;

public class AiGenerationServiceTests
{
    private const string TestUserId = "user-1";

    [Fact]
    public void BuildContinuationPrompt_IncludesRecentContent()
    {
        var request = new GenerateContinuationRequest("s1", "Main content", "openai", "gpt-4o-mini", null, null, null);

        var result = AiGenerationService.BuildContinuationPrompt(request);

        Assert.Contains("Main content", result);
    }

    [Fact]
    public void BuildContinuationPrompt_OmitsNullFields()
    {
        var request = new GenerateContinuationRequest("s1", "Content", "openai", "gpt-4o-mini", null, null, null);

        var result = AiGenerationService.BuildContinuationPrompt(request);

        Assert.DoesNotContain("Style:", result);
        Assert.DoesNotContain("Tone:", result);
        Assert.DoesNotContain("Genre:", result);
    }

    [Fact]
    public void BuildContinuationPrompt_IncludesAllFields()
    {
        var request = new GenerateContinuationRequest("s1", "Content", "openai", "gpt-4o-mini", "Fantasy", "Dark", "Prosaic");

        var result = AiGenerationService.BuildContinuationPrompt(request);

        Assert.Contains("Fantasy", result);
        Assert.Contains("Dark", result);
        Assert.Contains("Prosaic", result);
    }

    [Fact]
    public void BuildSuggestionPrompt_IncludesAllFields()
    {
        var request = new GenerateSuggestionRequest("s1", "Scene where hero meets villain", "Plot twist", "openai", "gpt-4o-mini");

        var result = AiGenerationService.BuildSuggestionPrompt(request);

        Assert.Contains("Scene where hero meets villain", result);
        Assert.Contains("Plot twist", result);
    }

    [Fact]
    public void BuildCharacterProfilePrompt_IncludesAllFields()
    {
        var request = new GenerateCharacterProfileRequest("s1", "Hero", "openai", "gpt-4o-mini", "Wise mentor", "Guide");

        var result = AiGenerationService.BuildCharacterProfilePrompt(request);

        Assert.Contains("Hero", result);
        Assert.Contains("Wise mentor", result);
        Assert.Contains("Guide", result);
    }

    [Fact]
    public async Task GenerateStoryContinuationAsync_YieldsChunks()
    {
        var mockProvider = new Mock<IChatProvider>();
        var updates = new List<AiStreamChunk>
        {
            new("Hello ", null),
            new("world!", null),
        };
        mockProvider.Setup(p => p.GenerateStreamAsync(
                It.IsAny<List<AiMessage>>(),
                It.IsAny<string>(),
                It.IsAny<CancellationToken>()))
            .Returns(updates.ToAsyncEnumerable());

        var mockFactory = new Mock<IChatProviderFactory>();
        mockFactory.Setup(f => f.CreateAsync("openai", TestUserId))
            .ReturnsAsync(mockProvider.Object);

        var service = new AiGenerationService(mockFactory.Object);
        var request = new GenerateContinuationRequest("s1", "Test content", "openai", "gpt-4o-mini", null, null, null);

        var chunks = await service.GenerateStoryContinuationAsync(request, TestUserId).ToListAsync();

        Assert.Equal(2, chunks.Count);
        Assert.Equal("Hello ", chunks[0]);
        Assert.Equal("world!", chunks[1]);
    }

    [Fact]
    public async Task GenerateStoryContinuationAsync_SkipsNullContent()
    {
        var mockProvider = new Mock<IChatProvider>();
        var updates = new List<AiStreamChunk>
        {
            new("text", null),
            new("", null),
        };
        mockProvider.Setup(p => p.GenerateStreamAsync(
                It.IsAny<List<AiMessage>>(),
                It.IsAny<string>(),
                It.IsAny<CancellationToken>()))
            .Returns(updates.ToAsyncEnumerable());

        var mockFactory = new Mock<IChatProviderFactory>();
        mockFactory.Setup(f => f.CreateAsync("openai", TestUserId))
            .ReturnsAsync(mockProvider.Object);

        var service = new AiGenerationService(mockFactory.Object);
        var request = new GenerateContinuationRequest("s1", "Test", "openai", "gpt-4o-mini", null, null, null);

        var chunks = await service.GenerateStoryContinuationAsync(request, TestUserId).ToListAsync();

        Assert.Single(chunks);
        Assert.Equal("text", chunks[0]);
    }

    [Fact]
    public void GenerateStoryContinuationAsync_ThrowsOnNullFactory()
    {
        Assert.Throws<ArgumentNullException>(() => new AiGenerationService(null!));
    }
}
