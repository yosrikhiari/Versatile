using MediatR;
using Versatile.Application.Branches.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Branches.Handlers;

public class UpdateBranchHandler : IRequestHandler<UpdateBranchCommand, BranchDto>
{
    private readonly IRepository<Branch> _repo;
    private readonly IUnitOfWork _uow;

    public UpdateBranchHandler(IRepository<Branch> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<BranchDto> Handle(UpdateBranchCommand request, CancellationToken ct)
    {
        var branch = await BranchMapping.OwnedAsync(_repo, request.Id, request.UserId, request.OrganizationId, ct);

        if (request.Name is not null) branch.Name = request.Name;
        if (request.Description is not null) branch.Description = request.Description;
        if (request.Status is not null) branch.Status = request.Status;
        if (request.SourceBranchId.HasValue)
            branch.SourceBranchId = await BranchMapping.SourceInStoryAsync(_repo, request.SourceBranchId, branch.StoryId, branch.Id, ct);
        branch.UpdatedAt = DateTime.UtcNow;

        _repo.Update(branch);
        await _uow.SaveChangesAsync(ct);
        return BranchMapping.ToDto(branch);
    }
}
