using System.Runtime.CompilerServices;
using Versatile.Application.DTOs;
using Versatile.Application.Services;

namespace Versatile.Infrastructure.Services;

public class AiGenerationService : IAiGenerationService
{
    private readonly IChatProviderFactory _factory;

    public AiGenerationService(IChatProviderFactory factory)
    {
        ArgumentNullException.ThrowIfNull(factory);
        _factory = factory;
    }

    public async IAsyncEnumerable<string> GenerateStoryContinuationAsync(GenerateContinuationRequest request, string userId, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var provider = await _factory.CreateAsync(request.Provider, userId);
        var messages = new List<AiMessage>
        {
            new("system", "You are an expert creative writing assistant. Write compelling, well-paced story continuations that match the established style, genre, and tone."),
            new("user", BuildContinuationPrompt(request)),
        };

        await foreach (var chunk in provider.GenerateStreamAsync(messages, request.Model, ct))
        {
            if (!string.IsNullOrEmpty(chunk.Text))
                yield return chunk.Text;
        }
    }

    public async IAsyncEnumerable<string> GenerateSuggestionAsync(GenerateSuggestionRequest request, string userId, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var provider = await _factory.CreateAsync(request.Provider, userId);
        var messages = new List<AiMessage>
        {
            new("system", "You are a creative writing coach. Provide concise, actionable writing suggestions."),
            new("user", BuildSuggestionPrompt(request)),
        };

        await foreach (var chunk in provider.GenerateStreamAsync(messages, request.Model, ct))
        {
            if (!string.IsNullOrEmpty(chunk.Text))
                yield return chunk.Text;
        }
    }

    public async IAsyncEnumerable<string> GenerateCharacterProfileAsync(GenerateCharacterProfileRequest request, string userId, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var provider = await _factory.CreateAsync(request.Provider, userId);
        var messages = new List<AiMessage>
        {
            new("system", "You are a character development expert. Create detailed, nuanced character profiles with personality, backstory, motivations, and flaws."),
            new("user", BuildCharacterProfilePrompt(request)),
        };

        await foreach (var chunk in provider.GenerateStreamAsync(messages, request.Model, ct))
        {
            if (!string.IsNullOrEmpty(chunk.Text))
                yield return chunk.Text;
        }
    }

    internal static string BuildContinuationPrompt(GenerateContinuationRequest request)
    {
        var prompt = $"Continue the following story:\n\n{request.RecentContent}\n\n";
        if (!string.IsNullOrEmpty(request.Genre)) prompt += $"Genre: {request.Genre}\n";
        if (!string.IsNullOrEmpty(request.Tone)) prompt += $"Tone: {request.Tone}\n";
        if (!string.IsNullOrEmpty(request.WritingStyle)) prompt += $"Style: {request.WritingStyle}\n";
        prompt += "\nWrite the next section maintaining consistency with the above.";
        return prompt;
    }

    internal static string BuildSuggestionPrompt(GenerateSuggestionRequest request)
    {
        return $"Context: {request.Context}\n\nFocus area: {request.Focus}\n\nProvide a creative writing suggestion to improve or advance this scene.";
    }

    internal static string BuildCharacterProfilePrompt(GenerateCharacterProfileRequest request)
    {
        var prompt = $"Create a detailed character profile for:\n\nName: {request.Name}\n";
        if (!string.IsNullOrEmpty(request.Archetype)) prompt += $"Archetype: {request.Archetype}\n";
        if (!string.IsNullOrEmpty(request.Role)) prompt += $"Role: {request.Role}\n";
        prompt += "\nInclude: appearance, personality, backstory, motivations, strengths, flaws, and potential character arc.";
        return prompt;
    }
}
