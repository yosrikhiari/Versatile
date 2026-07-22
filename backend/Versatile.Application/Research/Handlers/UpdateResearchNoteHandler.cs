using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Research.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using ResearchEntity = Versatile.Domain.Entities.Research;

namespace Versatile.Application.Research.Handlers;

public class UpdateResearchNoteHandler : IRequestHandler<UpdateResearchNoteCommand, ResearchDto>
{
    private readonly IRepository<ResearchEntity> _repo;
    private readonly IUnitOfWork _uow;

    public UpdateResearchNoteHandler(IRepository<ResearchEntity> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<ResearchDto> Handle(UpdateResearchNoteCommand request, CancellationToken ct)
    {
        var notes = await _repo.GetAllAsync(
            r => r.Id == request.Id && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct);
        var note = notes.FirstOrDefault() ?? throw new KeyNotFoundException("Research note not found");

        if (request.Title is not null) note.Title = request.Title;
        if (request.Content is not null) note.Content = request.Content;
        note.UpdatedAt = DateTime.UtcNow;

        _repo.Update(note);
        await _uow.SaveChangesAsync(ct);
        return new ResearchDto(note.Id, note.StoryId, note.Title, note.Content, note.CreatedAt, note.UpdatedAt);
    }
}
