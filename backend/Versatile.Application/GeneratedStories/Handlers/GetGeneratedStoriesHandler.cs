using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GeneratedStories.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GeneratedStories.Handlers;

public class GetGeneratedStoriesHandler : IRequestHandler<GetGeneratedStoriesQuery, List<GeneratedStoryDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<GeneratedStory> _generatedStories;

    public GetGeneratedStoriesHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<GeneratedStory> generatedStories)
    {
        _stories = stories;
        _generatedStories = generatedStories;
    }

    public async Task<List<GeneratedStoryDto>> Handle(GetGeneratedStoriesQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entities = await _generatedStories.GetAllAsync(g => g.StoryId == request.StoryId, ct);
        return entities
            .OrderByDescending(g => g.GeneratedAt)
            .Select(g => new GeneratedStoryDto(g.Id, g.StoryId, g.Title, g.Content, g.GeneratedAt, g.TotalWords, g.QualityScore))
            .ToList();
    }
}

public class GetGeneratedStoryByIdHandler : IRequestHandler<GetGeneratedStoryByIdQuery, GeneratedStoryDto>
{
    private readonly IRepository<GeneratedStory> _generatedStories;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetGeneratedStoryByIdHandler(
        IRepository<GeneratedStory> generatedStories,
        IOrganizationOwnedRepository<Story> stories)
    {
        _generatedStories = generatedStories;
        _stories = stories;
    }

    public async Task<GeneratedStoryDto> Handle(GetGeneratedStoryByIdQuery request, CancellationToken ct)
    {
        var entity = await _generatedStories.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GeneratedStory not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GeneratedStory not found");

        return new GeneratedStoryDto(entity.Id, entity.StoryId, entity.Title, entity.Content, entity.GeneratedAt, entity.TotalWords, entity.QualityScore);
    }
}
