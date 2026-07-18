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
    private readonly IChatProviderFactory _providerFactory;
    private readonly IGeneratedStoryService _story;
    private readonly ILogger<GenerationHub> _logger;

    public GenerationHub(
        IAiGenerationService ai,
        IChatProviderFactory providerFactory,
        IGeneratedStoryService story,
        ILogger<GenerationHub> logger)
    {
        _ai = ai;
        _providerFactory = providerFactory;
        _story = story;
        _logger = logger;
    }

    private Guid UserId => Guid.Parse(Context.User!.FindFirst(ClaimTypes.NameIdentifier)!.Value);
    private string OrgGroupPrefix => $"{Context.User!.FindFirstValue("org_id")}_";

    public async Task JoinStoryGroup(string storyId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"{OrgGroupPrefix}story_{storyId}");
    }

    public async Task LeaveStoryGroup(string storyId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"{OrgGroupPrefix}story_{storyId}");
    }

    public async Task GenerateContinuation(GenerateContinuationRequest request)
    {
        var storyId = Guid.Parse(request.StoryId);
        var sb = new StringBuilder();

        try
        {
            await foreach (var chunk in _ai.GenerateStoryContinuationAsync(request, UserId.ToString()))
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

            await Clients.Group($"{OrgGroupPrefix}story_{storyId}").SendAsync("GenerationComplete", storyId.ToString(), content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI continuation failed for story {StoryId}", storyId);
            await Clients.Group($"{OrgGroupPrefix}story_{storyId}").SendAsync("GenerationError", storyId.ToString(), ex.Message);
        }
    }

    public async Task GenerateSuggestion(GenerateSuggestionRequest request)
    {
        var storyId = Guid.Parse(request.StoryId);
        var sb = new StringBuilder();

        try
        {
            await foreach (var chunk in _ai.GenerateSuggestionAsync(request, UserId.ToString()))
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
            await Clients.Group($"{OrgGroupPrefix}story_{storyId}").SendAsync("GenerationError", storyId.ToString(), ex.Message);
        }
    }

    public async Task GenerateCharacterProfile(GenerateCharacterProfileRequest request)
    {
        var storyId = Guid.Parse(request.StoryId);
        var sb = new StringBuilder();

        try
        {
            await foreach (var chunk in _ai.GenerateCharacterProfileAsync(request, UserId.ToString()))
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

            await Clients.Group($"{OrgGroupPrefix}story_{storyId}").SendAsync("GenerationComplete", storyId.ToString(), content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI character profile failed for story {StoryId}", storyId);
            await Clients.Group($"{OrgGroupPrefix}story_{storyId}").SendAsync("GenerationError", storyId.ToString(), ex.Message);
        }
    }

    public async Task GenerateStream(string provider, string model, IReadOnlyList<AiMessage> messages)
    {
        try
        {
            var chatProvider = await _providerFactory.CreateAsync(provider, UserId.ToString());
            await foreach (var chunk in chatProvider.GenerateStreamAsync(messages, model))
            {
                if (!string.IsNullOrEmpty(chunk.Text))
                    await Clients.Caller.SendAsync("StreamChunk", chunk.Text);

                if (!string.IsNullOrEmpty(chunk.FinishReason))
                    await Clients.Caller.SendAsync("StreamEnd", chunk.FinishReason);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GenerateStream failed for provider {Provider}", provider);
            await Clients.Caller.SendAsync("StreamError", ex.Message);
        }
    }

    public async Task<TestConnectionResult> TestConnection(string provider, string model)
    {
        try
        {
            var chatProvider = await _providerFactory.CreateAsync(provider, UserId.ToString());
            return await chatProvider.TestConnectionAsync(model);
        }
        catch (Exception ex)
        {
            return new TestConnectionResult(false, null, ex.Message);
        }
    }

    public async Task<ListModelsResult> ListModels(string provider)
    {
        try
        {
            var chatProvider = await _providerFactory.CreateAsync(provider, UserId.ToString());
            return await chatProvider.ListModelsAsync();
        }
        catch (Exception ex)
        {
            return new ListModelsResult(false, [], ex.Message);
        }
    }
}
