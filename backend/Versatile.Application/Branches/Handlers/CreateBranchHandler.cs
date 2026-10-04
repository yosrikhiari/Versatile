using MediatR;
using Versatile.Application.Branches.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Branches.Handlers;

public class CreateBranchHandler : IRequestHandler<CreateBranchCommand, BranchDto>
{
    private readonly IRepository<Branch> _repo;
    private readonly IRepository<Story> _storyRepo;
    private readonly IUnitOfWork _uow;

    public CreateBranchHandler(IRepository<Branch> repo, IRepository<Story> storyRepo, IUnitOfWork uow)
    {
        _repo = repo;
        _storyRepo = storyRepo;
        _uow = uow;
    }

    public async Task<BranchDto> Handle(CreateBranchCommand request, CancellationToken ct)
    {
        var stories = await _storyRepo.GetAllAsync(
            s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        if (stories.Count == 0) throw new KeyNotFoundException("Story not found");

        var branch = new Branch
        {
            StoryId = request.StoryId,
            Name = request.Name,
            SourceBranchId = await BranchMapping.SourceInStoryAsync(_repo, request.SourceBranchId, request.StoryId, null, ct),
            Description = request.Description,
            Status = request.Status ?? "active",
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };
        await _repo.AddAsync(branch, ct);
        await _uow.SaveChangesAsync(ct);
        return BranchMapping.ToDto(branch);
    }
}
