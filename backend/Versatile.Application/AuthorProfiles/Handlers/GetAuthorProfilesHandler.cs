using MediatR;
using Versatile.Application.AuthorProfiles.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.AuthorProfiles.Handlers;
public class GetAuthorProfilesHandler : IRequestHandler<GetAuthorProfilesQuery, List<AuthorProfileDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<AuthorProfile> _entities;
    public GetAuthorProfilesHandler(IOrganizationOwnedRepository<Story> stories, IRepository<AuthorProfile> entities) { _stories = stories; _entities = entities; }
    public async Task<List<AuthorProfileDto>> Handle(GetAuthorProfilesQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");
        var items = await _entities.GetAllAsync(e => e.StoryId == request.StoryId, ct);
        return items.Select(e => ToDto(e)).ToList();
    }
    private static AuthorProfileDto ToDto(AuthorProfile e) => new(e.Id, e.StoryId, e.DisplayName, e.PenName, e.Bio, e.Settings, e.CreatedAt, e.UpdatedAt);
}
public class GetAuthorProfileByIdHandler : IRequestHandler<GetAuthorProfileByIdQuery, AuthorProfileDto>
{
    private readonly IRepository<AuthorProfile> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    public GetAuthorProfileByIdHandler(IRepository<AuthorProfile> entities, IOrganizationOwnedRepository<Story> stories) { _entities = entities; _stories = stories; }
    public async Task<AuthorProfileDto> Handle(GetAuthorProfileByIdQuery request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("AuthorProfile not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("AuthorProfile not found");
        return ToDto(entity);
    }
    private static AuthorProfileDto ToDto(AuthorProfile e) => new(e.Id, e.StoryId, e.DisplayName, e.PenName, e.Bio, e.Settings, e.CreatedAt, e.UpdatedAt);
}
