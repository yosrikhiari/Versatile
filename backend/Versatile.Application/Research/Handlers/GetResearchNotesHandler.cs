using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Research.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using ResearchEntity = Versatile.Domain.Entities.Research;

namespace Versatile.Application.Research.Handlers;

public class GetResearchNotesHandler : IRequestHandler<GetResearchNotesQuery, List<ResearchDto>>
{
    private readonly IRepository<ResearchEntity> _repo;
    public GetResearchNotesHandler(IRepository<ResearchEntity> repo) => _repo = repo;

    public async Task<List<ResearchDto>> Handle(GetResearchNotesQuery request, CancellationToken ct)
    {
        var notes = await _repo.GetAllAsync(
            r => r.StoryId == request.StoryId && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct);
        return notes.OrderByDescending(r => r.UpdatedAt)
            .Select(r => new ResearchDto(r.Id, r.StoryId, r.Title, r.Content, r.CreatedAt, r.UpdatedAt))
            .ToList();
    }
}
