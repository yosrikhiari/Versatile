using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Manuscripts.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Manuscripts.Handlers;

public class GetManuscriptsHandler : IRequestHandler<GetManuscriptsQuery, List<ManuscriptDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<Manuscript> _manuscripts;

    public GetManuscriptsHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<Manuscript> manuscripts)
    {
        _stories = stories;
        _manuscripts = manuscripts;
    }

    public async Task<List<ManuscriptDto>> Handle(GetManuscriptsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var manuscripts = await _manuscripts.GetAllAsync(m => m.StoryId == request.StoryId, ct);
        return manuscripts.Select(ToDto).ToList();
    }

    private static ManuscriptDto ToDto(Manuscript m) => new(
        m.Id, m.StoryId, m.Title, m.Content, m.WordCount, m.CreatedAt, m.UpdatedAt
    );
}

public class GetManuscriptByIdHandler : IRequestHandler<GetManuscriptByIdQuery, ManuscriptDto>
{
    private readonly IRepository<Manuscript> _manuscripts;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetManuscriptByIdHandler(
        IRepository<Manuscript> manuscripts,
        IOrganizationOwnedRepository<Story> stories)
    {
        _manuscripts = manuscripts;
        _stories = stories;
    }

    public async Task<ManuscriptDto> Handle(GetManuscriptByIdQuery request, CancellationToken ct)
    {
        var manuscript = await _manuscripts.GetByIdAsync(request.Id, ct);
        if (manuscript is null)
            throw new KeyNotFoundException("Manuscript not found");

        var story = await _stories.GetByIdForOrganizationAsync(manuscript.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Manuscript not found");

        return ToDto(manuscript);
    }

    private static ManuscriptDto ToDto(Manuscript m) => new(
        m.Id, m.StoryId, m.Title, m.Content, m.WordCount, m.CreatedAt, m.UpdatedAt
    );
}
