using MediatR;
using Versatile.Application.Branches.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Branches.Handlers;

public class GetBranchesHandler : IRequestHandler<GetBranchesQuery, List<BranchDto>>
{
    private readonly IRepository<Branch> _repo;
    public GetBranchesHandler(IRepository<Branch> repo) => _repo = repo;

    public async Task<List<BranchDto>> Handle(GetBranchesQuery request, CancellationToken ct)
    {
        var rows = await _repo.GetAllAsync(
            b => b.StoryId == request.StoryId && b.UserId == request.UserId && b.OrganizationId == request.OrganizationId, ct);
        // Sources before their forks, so a client pulling in order can resolve each fork's source.
        return rows.OrderBy(b => b.CreatedAt).Select(BranchMapping.ToDto).ToList();
    }
}

public class GetBranchByIdHandler : IRequestHandler<GetBranchByIdQuery, BranchDto>
{
    private readonly IRepository<Branch> _repo;
    public GetBranchByIdHandler(IRepository<Branch> repo) => _repo = repo;

    public async Task<BranchDto> Handle(GetBranchByIdQuery request, CancellationToken ct) =>
        BranchMapping.ToDto(await BranchMapping.OwnedAsync(_repo, request.Id, request.UserId, request.OrganizationId, ct));
}
