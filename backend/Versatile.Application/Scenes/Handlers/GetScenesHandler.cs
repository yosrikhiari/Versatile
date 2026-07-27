using System.Linq.Expressions;
using MediatR;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Scenes.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Scenes.Handlers;

public class GetScenesHandler : IRequestHandler<GetScenesQuery, PagedResponse<SceneDto>>
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

    public async Task<PagedResponse<SceneDto>> Handle(GetScenesQuery request, CancellationToken ct)
    {
        var chapter = await _chapters.GetByIdForOrganizationAsync(request.ChapterId, request.OrganizationId!.Value, ct);
        if (chapter is null || chapter.UserId != request.UserId)
            throw new KeyNotFoundException("Chapter not found");

        Expression<Func<Scene, bool>> filter = s => s.ChapterId == request.ChapterId;

        if (request.AfterId.HasValue || request.Page <= 1)
        {
            var (scenes, hasNextPage) = await _scenes.GetPagedKeysetAsync(filter, request.PageSize, request.AfterId,
                q => q.OrderBy(s => s.Order), ct);
            var items = scenes.Select(s => new SceneDto(s.Id, s.ChapterId, s.Title, s.Content, s.Status, s.WordCount, s.Order, s.CreatedAt, s.UpdatedAt)).ToList();
            var nextCursor = hasNextPage ? items.LastOrDefault()?.Id : null;

            if (request.AfterId.HasValue)
                return new PagedResponse<SceneDto>(items, 0, 0, request.PageSize, nextCursor);

            // First page with keyset -- also compute total count for backward compatibility
            var keysetTotalCount = await _scenes.CountAsync(filter, ct);
            return new PagedResponse<SceneDto>(items, keysetTotalCount, request.Page, request.PageSize, nextCursor);
        }

        var (scenesPaged, totalCount) = await _scenes.GetPagedAsync(filter, request.Page, request.PageSize, q => q.OrderBy(s => s.Order), ct);
        var itemsPaged = scenesPaged.Select(s => new SceneDto(s.Id, s.ChapterId, s.Title, s.Content, s.Status, s.WordCount, s.Order, s.CreatedAt, s.UpdatedAt)).ToList();
        return new PagedResponse<SceneDto>(itemsPaged, totalCount, request.Page, request.PageSize);
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