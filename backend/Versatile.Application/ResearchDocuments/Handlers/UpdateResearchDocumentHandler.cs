using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchDocuments.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchDocuments.Handlers;

public class UpdateResearchDocumentHandler : IRequestHandler<UpdateResearchDocumentCommand, ResearchDocumentDto>
{
    private readonly IRepository<ResearchDocument> _repo;
    private readonly IUnitOfWork _uow;

    public UpdateResearchDocumentHandler(IRepository<ResearchDocument> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<ResearchDocumentDto> Handle(UpdateResearchDocumentCommand request, CancellationToken ct)
    {
        var docs = await _repo.GetAllAsync(
            d => d.Id == request.Id && d.UserId == request.UserId, ct);
        var doc = docs.FirstOrDefault() ?? throw new KeyNotFoundException("Research document not found");

        if (request.FileName is not null) doc.FileName = request.FileName;
        if (request.FileType is not null) doc.FileType = request.FileType;
        if (request.Content is not null) doc.Content = request.Content;
        if (request.Notes is not null) doc.Notes = request.Notes;
        doc.UpdatedAt = DateTime.UtcNow;

        _repo.Update(doc);
        await _uow.SaveChangesAsync(ct);
        return new ResearchDocumentDto(doc.Id, doc.StoryId, doc.FileName, doc.FileType, doc.ImportedAt, doc.Content!, doc.Notes!, doc.CreatedAt);
    }
}
