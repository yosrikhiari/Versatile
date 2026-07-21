using MediatR;
using Versatile.Application.Scenes.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Scenes.Handlers;

public class DeleteSceneHandler : IRequestHandler<DeleteSceneCommand, Unit>
{
    private readonly IRepository<Scene> _scenes;
    private readonly IOrganizationOwnedRepository<Chapter> _chapters;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteSceneHandler(
        IRepository<Scene> scenes,
        IOrganizationOwnedRepository<Chapter> chapters,
        IUnitOfWork unitOfWork)
    {
        _scenes = scenes;
        _chapters = chapters;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteSceneCommand request, CancellationToken ct)
    {
        var scene = await _scenes.GetByIdAsync(request.Id, ct);
        if (scene is null)
            throw new KeyNotFoundException("Scene not found");

        var chapter = await _chapters.GetByIdForOrganizationAsync(scene.ChapterId, request.OrganizationId!.Value, ct);
        if (chapter is null || chapter.UserId != request.UserId)
            throw new KeyNotFoundException("Scene not found");

        _scenes.Delete(scene);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
