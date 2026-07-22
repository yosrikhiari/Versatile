using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Research.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using ResearchEntity = Versatile.Domain.Entities.Research;

namespace Versatile.Application.Research.Handlers;

public class CreateResearchNoteHandler : IRequestHandler<CreateResearchNoteCommand, ResearchDto>
{
    private readonly IRepository<ResearchEntity> _repo;
    private readonly IRepository<Story> _storyRepo;
    private readonly IUnitOfWork _uow;

    public CreateResearchNoteHandler(IRepository<ResearchEntity> repo, IRepository<Story> storyRepo, IUnitOfWork uow)
    {
        _repo = repo;
        _storyRepo = storyRepo;
        _uow = uow;
    }

    public async Task<ResearchDto> Handle(CreateResearchNoteCommand request, CancellationToken ct)
    {
        var stories = await _storyRepo.GetAllAsync(
            s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        if (stories.Count == 0) throw new KeyNotFoundException("Story not found");

        var note = new ResearchEntity
        {
            StoryId = request.StoryId,
            Title = request.Title,
            Content = request.Content,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };
        await _repo.AddAsync(note, ct);
        await _uow.SaveChangesAsync(ct);
        return new ResearchDto(note.Id, note.StoryId, note.Title, note.Content, note.CreatedAt, note.UpdatedAt);
    }
}
