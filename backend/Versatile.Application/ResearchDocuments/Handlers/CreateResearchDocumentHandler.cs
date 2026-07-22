using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchDocuments.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchDocuments.Handlers;

public class CreateResearchDocumentHandler : IRequestHandler<CreateResearchDocumentCommand, ResearchDocumentDto>
{
    private readonly IRepository<ResearchDocument> _repo;
    private readonly IRepository<Story> _storyRepo;
    private readonly IUnitOfWork _uow;

    public CreateResearchDocumentHandler(IRepository<ResearchDocument> repo, IRepository<Story> storyRepo, IUnitOfWork uow)
    {
        _repo = repo;
        _storyRepo = storyRepo;
        _uow = uow;
    }

    public async Task<ResearchDocumentDto> Handle(CreateResearchDocumentCommand request, CancellationToken ct)
    {
        var stories = await _storyRepo.GetAllAsync(
            s => s.Id == request.StoryId && s.UserId == request.UserId, ct);
        if (stories.Count == 0) throw new KeyNotFoundException("Story not found");

        var doc = new ResearchDocument
        {
            StoryId = request.StoryId,
            FileName = request.FileName,
            FileType = request.FileType,
            Content = request.Content,
            Notes = request.Notes,
            UserId = request.UserId
        };
        await _repo.AddAsync(doc, ct);
        await _uow.SaveChangesAsync(ct);
        return new ResearchDocumentDto(doc.Id, doc.StoryId, doc.FileName, doc.FileType, doc.ImportedAt, doc.Content!, doc.Notes!, doc.CreatedAt);
    }
}
