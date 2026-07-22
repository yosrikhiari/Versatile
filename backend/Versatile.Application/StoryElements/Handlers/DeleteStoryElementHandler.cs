using MediatR;
using Versatile.Application.StoryElements.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryElements.Handlers;

public class DeleteStoryElementHandler : IRequestHandler<DeleteStoryElementCommand, Unit>
{
    private readonly IRepository<StoryElement> _elements;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteStoryElementHandler(
        IRepository<StoryElement> elements,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _elements = elements;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteStoryElementCommand request, CancellationToken ct)
    {
        var element = await _elements.GetByIdAsync(request.Id, ct);
        if (element is null)
            throw new KeyNotFoundException("StoryElement not found");

        var story = await _stories.GetByIdForOrganizationAsync(element.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("StoryElement not found");

        _elements.Delete(element);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
