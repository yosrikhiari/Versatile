using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchTags.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchTags.Handlers;

public class UpdateResearchTagHandler : IRequestHandler<UpdateResearchTagCommand, ResearchTagDto>
{
    private readonly IRepository<ResearchTag> _repo;
    private readonly IUnitOfWork _uow;

    public UpdateResearchTagHandler(IRepository<ResearchTag> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<ResearchTagDto> Handle(UpdateResearchTagCommand request, CancellationToken ct)
    {
        var tags = await _repo.GetAllAsync(
            t => t.Id == request.Id && t.UserId == request.UserId, ct);
        var tag = tags.FirstOrDefault() ?? throw new KeyNotFoundException("Research tag not found");

        if (request.Name is not null) tag.Name = request.Name;
        if (request.Color is not null) tag.Color = request.Color;
        tag.UpdatedAt = DateTime.UtcNow;

        _repo.Update(tag);
        await _uow.SaveChangesAsync(ct);
        return new ResearchTagDto(tag.Id, tag.StoryId, tag.Name, tag.Color!);
    }
}
