using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchTags.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchTags.Handlers;

public class GetResearchTagsHandler : IRequestHandler<GetResearchTagsQuery, List<ResearchTagDto>>
{
    private readonly IRepository<ResearchTag> _repo;
    public GetResearchTagsHandler(IRepository<ResearchTag> repo) => _repo = repo;

    public async Task<List<ResearchTagDto>> Handle(GetResearchTagsQuery request, CancellationToken ct)
    {
        var tags = await _repo.GetAllAsync(
            t => t.StoryId == request.StoryId && t.UserId == request.UserId, ct);
        return tags.OrderBy(t => t.Name)
            .Select(t => new ResearchTagDto(t.Id, t.StoryId, t.Name, t.Color!))
            .ToList();
    }
}
