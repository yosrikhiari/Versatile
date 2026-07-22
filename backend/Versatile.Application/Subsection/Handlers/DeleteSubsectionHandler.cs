using MediatR;
using Versatile.Application.Subsection.Commands;
using Versatile.Domain.Interfaces;
using SubsectionEntity = Versatile.Domain.Entities.Subsection;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Subsection.Handlers;

public class DeleteSubsectionHandler : IRequestHandler<DeleteSubsectionCommand, Unit>
{
    private readonly IRepository<SubsectionEntity> _subsectionRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteSubsectionHandler(IRepository<SubsectionEntity> subsectionRepo, IOrganizationOwnedRepository<Story> storyRepo, IUnitOfWork unitOfWork)
    {
        _subsectionRepo = subsectionRepo;
        _storyRepo = storyRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteSubsectionCommand request, CancellationToken ct)
    {
        var subsection = await _subsectionRepo.GetByIdAsync(request.Id, ct);
        if (subsection is null)
            throw new KeyNotFoundException("Subsection not found");

        var story = await _storyRepo.GetByIdForOrganizationAsync(subsection.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Subsection not found");

        _subsectionRepo.Delete(subsection);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
