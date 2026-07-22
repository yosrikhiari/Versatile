using MediatR;
using Versatile.Application.GeneratedStories.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GeneratedStories.Handlers;

public class DeleteGeneratedStoryHandler : IRequestHandler<DeleteGeneratedStoryCommand, Unit>
{
    private readonly IRepository<GeneratedStory> _generatedStories;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteGeneratedStoryHandler(
        IRepository<GeneratedStory> generatedStories,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _generatedStories = generatedStories;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteGeneratedStoryCommand request, CancellationToken ct)
    {
        var entity = await _generatedStories.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GeneratedStory not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GeneratedStory not found");

        _generatedStories.Delete(entity);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
