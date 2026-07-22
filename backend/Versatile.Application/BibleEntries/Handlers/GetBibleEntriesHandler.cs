using MediatR;
using Versatile.Application.BibleEntries.Queries;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.BibleEntries.Handlers;
public class GetBibleEntriesHandler : IRequestHandler<GetBibleEntriesQuery, PagedResponse<BibleEntryDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<BibleEntry> _entities;
    public GetBibleEntriesHandler(IOrganizationOwnedRepository<Story> stories, IRepository<BibleEntry> entities) { _stories = stories; _entities = entities; }
    public async Task<PagedResponse<BibleEntryDto>> Handle(GetBibleEntriesQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");
        var (items, totalCount) = await _entities.GetPagedAsync(e => e.StoryId == request.StoryId, request.Page, request.PageSize, ct);
        return new PagedResponse<BibleEntryDto>(items.Select(e => ToDto(e)).ToList(), totalCount, request.Page, request.PageSize);
    }
    private static BibleEntryDto ToDto(BibleEntry e) => new(e.Id, e.StoryId, e.Title, e.Content, e.Category, e.CreatedAt, e.UpdatedAt);
}
public class GetBibleEntryByIdHandler : IRequestHandler<GetBibleEntryByIdQuery, BibleEntryDto>
{
    private readonly IRepository<BibleEntry> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    public GetBibleEntryByIdHandler(IRepository<BibleEntry> entities, IOrganizationOwnedRepository<Story> stories) { _entities = entities; _stories = stories; }
    public async Task<BibleEntryDto> Handle(GetBibleEntryByIdQuery request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("BibleEntry not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("BibleEntry not found");
        return ToDto(entity);
    }
    private static BibleEntryDto ToDto(BibleEntry e) => new(e.Id, e.StoryId, e.Title, e.Content, e.Category, e.CreatedAt, e.UpdatedAt);
}
