using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Scenes.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Scenes.Handlers;

public class UpdateSceneHandler : IRequestHandler<UpdateSceneCommand, SceneDto>
{
    private readonly IRepository<Scene> _scenes;
    private readonly IOrganizationOwnedRepository<Chapter> _chapters;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSceneHandler(
        IRepository<Scene> scenes,
        IOrganizationOwnedRepository<Chapter> chapters,
        IUnitOfWork unitOfWork)
    {
        _scenes = scenes;
        _chapters = chapters;
        _unitOfWork = unitOfWork;
    }

    public async Task<SceneDto> Handle(UpdateSceneCommand request, CancellationToken ct)
    {
        var scene = await _scenes.GetByIdAsync(request.Id, ct);
        if (scene is null)
            throw new KeyNotFoundException("Scene not found");

        var chapter = await _chapters.GetByIdForOrganizationAsync(scene.ChapterId, request.OrganizationId!.Value, ct);
        if (chapter is null || chapter.UserId != request.UserId)
            throw new KeyNotFoundException("Scene not found");

        if (request.Title is not null) scene.Title = request.Title;
        if (request.Content is not null) { scene.Content = request.Content; scene.WordCount = CountWords(request.Content); }
        if (request.Status is not null) scene.Status = request.Status;
        if (request.Order.HasValue) scene.Order = request.Order.Value;
        scene.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(scene);
    }

    private static int CountWords(string text) =>
        text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;

    private static SceneDto ToDto(Scene s) => new(
        s.Id, s.ChapterId, s.Title, s.Content, s.Status, s.WordCount, s.Order, s.CreatedAt, s.UpdatedAt
    );
}
