using MediatR;
using Versatile.Application.Manuscripts.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Manuscripts.Handlers;

public class DeleteManuscriptHandler : IRequestHandler<DeleteManuscriptCommand, Unit>
{
    private readonly IRepository<Manuscript> _manuscripts;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteManuscriptHandler(
        IRepository<Manuscript> manuscripts,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _manuscripts = manuscripts;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteManuscriptCommand request, CancellationToken ct)
    {
        var manuscript = await _manuscripts.GetByIdAsync(request.Id, ct);
        if (manuscript is null)
            throw new KeyNotFoundException("Manuscript not found");

        var story = await _stories.GetByIdForOrganizationAsync(manuscript.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Manuscript not found");

        _manuscripts.Delete(manuscript);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
