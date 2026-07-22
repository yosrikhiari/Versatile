using MediatR;
using Versatile.Application.Volume.Commands;
using Versatile.Domain.Interfaces;
using VolumeEntity = Versatile.Domain.Entities.Volume;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Volume.Handlers;

public class DeleteVolumeHandler : IRequestHandler<DeleteVolumeCommand, Unit>
{
    private readonly IRepository<VolumeEntity> _volumeRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteVolumeHandler(IRepository<VolumeEntity> volumeRepo, IOrganizationOwnedRepository<Story> storyRepo, IUnitOfWork unitOfWork)
    {
        _volumeRepo = volumeRepo;
        _storyRepo = storyRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteVolumeCommand request, CancellationToken ct)
    {
        var volume = await _volumeRepo.GetByIdAsync(request.Id, ct);
        if (volume is null)
            throw new KeyNotFoundException("Volume not found");

        var story = await _storyRepo.GetByIdForOrganizationAsync(volume.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Volume not found");

        _volumeRepo.Delete(volume);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
