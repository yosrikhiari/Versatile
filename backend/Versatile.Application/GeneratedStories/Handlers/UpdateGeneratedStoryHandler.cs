using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GeneratedStories.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GeneratedStories.Handlers;

public class UpdateGeneratedStoryHandler : IRequestHandler<UpdateGeneratedStoryCommand, GeneratedStoryDto>
{
    private readonly IRepository<GeneratedStory> _generatedStories;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateGeneratedStoryHandler(
        IRepository<GeneratedStory> generatedStories,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _generatedStories = generatedStories;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<GeneratedStoryDto> Handle(UpdateGeneratedStoryCommand request, CancellationToken ct)
    {
        var entity = await _generatedStories.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GeneratedStory not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GeneratedStory not found");

        if (request.Title is not null) entity.Title = request.Title;
        if (request.Content is not null) entity.Content = request.Content;
        if (request.TotalWords.HasValue) entity.TotalWords = request.TotalWords.Value;
        if (request.QualityScore is not null) entity.QualityScore = request.QualityScore;
        entity.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(entity);
    }

    private static GeneratedStoryDto ToDto(GeneratedStory g) => new(
        g.Id, g.StoryId, g.Title, g.Content, g.GeneratedAt, g.TotalWords, g.QualityScore
    );
}
