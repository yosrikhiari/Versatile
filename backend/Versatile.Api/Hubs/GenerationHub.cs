using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Versatile.Application.DTOs;
using Versatile.Application.Services;

namespace Versatile.Api.Hubs;

[Authorize]
public class GenerationHub : Hub
{
    private readonly IAiGenerationService _ai;
    private readonly IGeneratedStoryService _story;
    private readonly ILogger<GenerationHub> _logger;

    public GenerationHub(
        IAiGenerationService ai,
        IGeneratedStoryService story,
        ILogger<GenerationHub> logger)
    {
        _ai = ai;
        _story = story;
        _logger = logger;
    }

    private Guid UserId => Guid.Parse(Context.User!.FindFirst(ClaimTypes.NameIdentifier)!.Value);

    public async Task JoinStoryGroup(string storyId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"story_{storyId}");
    }

    public async Task LeaveStoryGroup(string storyId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"story_{storyId}");
    }

    public async Task GenerateContinuation(GenerateContinuationRequest request)
    {
        var storyId = Guid.Parse(request.StoryId);
        var sb = new StringBuilder();

        try
        {
            await foreach (var chunk in _ai.GenerateStoryContinuationAsync(request))
            {
                sb.Append(chunk);
                await Clients.Caller.SendAsync("GenerationProgress", chunk, sb.Length);
            }

            var content = sb.ToString();
            if (string.IsNullOrWhiteSpace(content))
                throw new InvalidOperationException("AI returned empty content.");

            var wordCount = content.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
            var dto = await _story.CreateAsync(storyId, new CreateGeneratedStoryRequest(
                "AI Continuation", content, wordCount, null
            ), UserId);

            await Clients.Group($"story_{storyId}").SendAsync("GenerationComplete", storyId.ToString(), content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI continuation failed for story {StoryId}", storyId);
            await Clients.Group($"story_{storyId}").SendAsync("GenerationError", storyId.ToString(), ex.Message);
        }
    }

    public async Task GenerateSuggestion(GenerateSuggestionRequest request)
    {
        var storyId = Guid.Parse(request.StoryId);
        var sb = new StringBuilder();

        try
        {
            await foreach (var chunk in _ai.GenerateSuggestionAsync(request))
            {
                sb.Append(chunk);
                await Clients.Caller.SendAsync("GenerationProgress", chunk, sb.Length);
            }

            var content = sb.ToString();
            if (string.IsNullOrWhiteSpace(content))
                throw new InvalidOperationException("AI returned empty content.");

            await Clients.Caller.SendAsync("GenerationComplete", storyId.ToString(), content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI suggestion failed for story {StoryId}", storyId);
            await Clients.Group($"story_{storyId}").SendAsync("GenerationError", storyId.ToString(), ex.Message);
        }
    }

    public async Task GenerateCharacterProfile(GenerateCharacterProfileRequest request)
    {
        var storyId = Guid.Parse(request.StoryId);
        var sb = new StringBuilder();

        try
        {
            await foreach (var chunk in _ai.GenerateCharacterProfileAsync(request))
            {
                sb.Append(chunk);
                await Clients.Caller.SendAsync("GenerationProgress", chunk, sb.Length);
            }

            var content = sb.ToString();
            if (string.IsNullOrWhiteSpace(content))
                throw new InvalidOperationException("AI returned empty content.");

            var wordCount = content.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
            var dto = await _story.CreateAsync(storyId, new CreateGeneratedStoryRequest(
                $"Character: {request.Name}", content, wordCount, null
            ), UserId);

            await Clients.Group($"story_{storyId}").SendAsync("GenerationComplete", storyId.ToString(), content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI character profile failed for story {StoryId}", storyId);
            await Clients.Group($"story_{storyId}").SendAsync("GenerationError", storyId.ToString(), ex.Message);
        }
    }
}
