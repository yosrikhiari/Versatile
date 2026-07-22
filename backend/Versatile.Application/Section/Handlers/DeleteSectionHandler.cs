using MediatR;
using Versatile.Application.Section.Commands;
using Versatile.Domain.Interfaces;
using SectionEntity = Versatile.Domain.Entities.Section;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Section.Handlers;

public class DeleteSectionHandler : IRequestHandler<DeleteSectionCommand, Unit>
{
    private readonly IRepository<SectionEntity> _sectionRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteSectionHandler(IRepository<SectionEntity> sectionRepo, IOrganizationOwnedRepository<Story> storyRepo, IUnitOfWork unitOfWork)
    {
        _sectionRepo = sectionRepo;
        _storyRepo = storyRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteSectionCommand request, CancellationToken ct)
    {
        var section = await _sectionRepo.GetByIdAsync(request.Id, ct);
        if (section is null)
            throw new KeyNotFoundException("Section not found");

        var story = await _storyRepo.GetByIdForOrganizationAsync(section.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Section not found");

        _sectionRepo.Delete(section);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
