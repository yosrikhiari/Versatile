using System.Runtime.CompilerServices;
using OpenAI.Chat;
using Versatile.Application.Services;
using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public class AiGenerationService : IAiGenerationService
{
    private readonly IChatStreamer _chat;

    public AiGenerationService(IChatStreamer chat)
    {
        ArgumentNullException.ThrowIfNull(chat);
        _chat = chat;
    }

    public async IAsyncEnumerable<string> GenerateStoryContinuationAsync(GenerateContinuationRequest request, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("You are an expert creative writing assistant. Write compelling, well-paced story continuations that match the established style, genre, and tone."),
            new UserChatMessage(BuildContinuationPrompt(request)),
        };

        await foreach (var update in _chat.CompleteChatStreamingAsync(messages, cancellationToken: ct))
        {
            foreach (var content in update.ContentUpdate)
            {
                if (!string.IsNullOrEmpty(content.Text))
                    yield return content.Text;
            }
        }
    }

    public async IAsyncEnumerable<string> GenerateSuggestionAsync(GenerateSuggestionRequest request, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("You are a creative writing coach. Provide concise, actionable writing suggestions."),
            new UserChatMessage(BuildSuggestionPrompt(request)),
        };

        await foreach (var update in _chat.CompleteChatStreamingAsync(messages, cancellationToken: ct))
        {
            foreach (var content in update.ContentUpdate)
            {
                if (!string.IsNullOrEmpty(content.Text))
                    yield return content.Text;
            }
        }
    }

    public async IAsyncEnumerable<string> GenerateCharacterProfileAsync(GenerateCharacterProfileRequest request, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("You are a character development expert. Create detailed, nuanced character profiles with personality, backstory, motivations, and flaws."),
            new UserChatMessage(BuildCharacterProfilePrompt(request)),
        };

        await foreach (var update in _chat.CompleteChatStreamingAsync(messages, cancellationToken: ct))
        {
            foreach (var content in update.ContentUpdate)
            {
                if (!string.IsNullOrEmpty(content.Text))
                    yield return content.Text;
            }
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
