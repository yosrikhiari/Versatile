using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchTags.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchTags.Handlers;

public class GetResearchTagByIdHandler : IRequestHandler<GetResearchTagByIdQuery, ResearchTagDto>
{
    private readonly IRepository<ResearchTag> _repo;
    public GetResearchTagByIdHandler(IRepository<ResearchTag> repo) => _repo = repo;

    public async Task<ResearchTagDto> Handle(GetResearchTagByIdQuery request, CancellationToken ct)
    {
        var tags = await _repo.GetAllAsync(
            t => t.Id == request.Id && t.UserId == request.UserId, ct);
        var tag = tags.FirstOrDefault() ?? throw new KeyNotFoundException("Research tag not found");
        return new ResearchTagDto(tag.Id, tag.StoryId, tag.Name, tag.Color!);
    }
}
