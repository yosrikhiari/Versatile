using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GeneratedStories.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GeneratedStories.Handlers;

public class CreateGeneratedStoryHandler : IRequestHandler<CreateGeneratedStoryCommand, GeneratedStoryDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<GeneratedStory> _generatedStories;
    private readonly IUnitOfWork _unitOfWork;

    public CreateGeneratedStoryHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<GeneratedStory> generatedStories,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _generatedStories = generatedStories;
        _unitOfWork = unitOfWork;
    }

    public async Task<GeneratedStoryDto> Handle(CreateGeneratedStoryCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entity = new GeneratedStory
        {
            StoryId = request.StoryId,
            Title = request.Title,
            Content = request.Content,
            TotalWords = request.TotalWords,
            QualityScore = request.QualityScore,
            GeneratedAt = DateTime.UtcNow,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _generatedStories.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(entity);
    }

    private static GeneratedStoryDto ToDto(GeneratedStory g) => new(
        g.Id, g.StoryId, g.Title, g.Content, g.GeneratedAt, g.TotalWords, g.QualityScore
    );
}
