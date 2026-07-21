using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Scenes.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Scenes.Handlers;

public class GetScenesHandler : IRequestHandler<GetScenesQuery, List<SceneDto>>
{
    private readonly IOrganizationOwnedRepository<Chapter> _chapters;
    private readonly IRepository<Scene> _scenes;

    public GetScenesHandler(
        IOrganizationOwnedRepository<Chapter> chapters,
        IRepository<Scene> scenes)
    {
        _chapters = chapters;
        _scenes = scenes;
    }

    public async Task<List<SceneDto>> Handle(GetScenesQuery request, CancellationToken ct)
    {
        var chapter = await _chapters.GetByIdForOrganizationAsync(request.ChapterId, request.OrganizationId!.Value, ct);
        if (chapter is null || chapter.UserId != request.UserId)
            throw new KeyNotFoundException("Chapter not found");

        var scenes = await _scenes.GetAllAsync(s => s.ChapterId == request.ChapterId, ct);
        return scenes
            .OrderBy(s => s.Order)
            .Select(s => new SceneDto(s.Id, s.ChapterId, s.Title, s.Content, s.Status, s.WordCount, s.Order, s.CreatedAt, s.UpdatedAt))
            .ToList();
    }
}

public class GetSceneByIdHandler : IRequestHandler<GetSceneByIdQuery, SceneDto>
{
    private readonly IRepository<Scene> _scenes;
    private readonly IOrganizationOwnedRepository<Chapter> _chapters;

    public GetSceneByIdHandler(
        IRepository<Scene> scenes,
        IOrganizationOwnedRepository<Chapter> chapters)
    {
        _scenes = scenes;
        _chapters = chapters;
    }

    public async Task<SceneDto> Handle(GetSceneByIdQuery request, CancellationToken ct)
    {
        var scene = await _scenes.GetByIdAsync(request.Id, ct);
        if (scene is null)
            throw new KeyNotFoundException("Scene not found");

        var chapter = await _chapters.GetByIdForOrganizationAsync(scene.ChapterId, request.OrganizationId!.Value, ct);
        if (chapter is null || chapter.UserId != request.UserId)
            throw new KeyNotFoundException("Scene not found");

        return new SceneDto(scene.Id, scene.ChapterId, scene.Title, scene.Content, scene.Status, scene.WordCount, scene.Order, scene.CreatedAt, scene.UpdatedAt);
    }
}
