using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchDocuments.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchDocuments.Handlers;

public class GetResearchDocumentsHandler : IRequestHandler<GetResearchDocumentsQuery, List<ResearchDocumentDto>>
{
    private readonly IRepository<ResearchDocument> _repo;
    public GetResearchDocumentsHandler(IRepository<ResearchDocument> repo) => _repo = repo;

    public async Task<List<ResearchDocumentDto>> Handle(GetResearchDocumentsQuery request, CancellationToken ct)
    {
        var docs = await _repo.GetAllAsync(
            d => d.StoryId == request.StoryId && d.UserId == request.UserId, ct);
        return docs.OrderByDescending(d => d.ImportedAt)
            .Select(d => new ResearchDocumentDto(d.Id, d.StoryId, d.FileName, d.FileType, d.ImportedAt, d.Content!, d.Notes!, d.CreatedAt))
            .ToList();
    }
}
