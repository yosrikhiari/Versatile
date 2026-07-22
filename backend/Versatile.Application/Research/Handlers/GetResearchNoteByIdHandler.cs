using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Research.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using ResearchEntity = Versatile.Domain.Entities.Research;

namespace Versatile.Application.Research.Handlers;

public class GetResearchNoteByIdHandler : IRequestHandler<GetResearchNoteByIdQuery, ResearchDto>
{
    private readonly IRepository<ResearchEntity> _repo;
    public GetResearchNoteByIdHandler(IRepository<ResearchEntity> repo) => _repo = repo;

    public async Task<ResearchDto> Handle(GetResearchNoteByIdQuery request, CancellationToken ct)
    {
        var notes = await _repo.GetAllAsync(
            r => r.Id == request.Id && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct);
        var note = notes.FirstOrDefault() ?? throw new KeyNotFoundException("Research note not found");
        return new ResearchDto(note.Id, note.StoryId, note.Title, note.Content, note.CreatedAt, note.UpdatedAt);
    }
}
