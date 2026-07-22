using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchChunks.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchChunks.Handlers;

public class GetResearchChunksHandler : IRequestHandler<GetResearchChunksQuery, List<ResearchChunkDto>>
{
    private readonly IRepository<ResearchChunk> _repo;
    public GetResearchChunksHandler(IRepository<ResearchChunk> repo) => _repo = repo;

    public async Task<List<ResearchChunkDto>> Handle(GetResearchChunksQuery request, CancellationToken ct)
    {
        var chunks = await _repo.GetAllAsync(
            c => c.StoryId == request.StoryId && c.UserId == request.UserId, ct);
        return chunks.OrderBy(c => c.ChunkIndex)
            .Select(c => new ResearchChunkDto(c.Id, c.StoryId, c.DocumentId, c.ChunkIndex, c.Content, c.Embedding!, c.CreatedAt))
            .ToList();
    }
}
