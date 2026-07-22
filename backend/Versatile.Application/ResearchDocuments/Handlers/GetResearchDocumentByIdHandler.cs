using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchDocuments.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchDocuments.Handlers;

public class GetResearchDocumentByIdHandler : IRequestHandler<GetResearchDocumentByIdQuery, ResearchDocumentDto>
{
    private readonly IRepository<ResearchDocument> _repo;
    public GetResearchDocumentByIdHandler(IRepository<ResearchDocument> repo) => _repo = repo;

    public async Task<ResearchDocumentDto> Handle(GetResearchDocumentByIdQuery request, CancellationToken ct)
    {
        var docs = await _repo.GetAllAsync(
            d => d.Id == request.Id && d.UserId == request.UserId, ct);
        var doc = docs.FirstOrDefault() ?? throw new KeyNotFoundException("Research document not found");
        return new ResearchDocumentDto(doc.Id, doc.StoryId, doc.FileName, doc.FileType, doc.ImportedAt, doc.Content!, doc.Notes!, doc.CreatedAt);
    }
}
