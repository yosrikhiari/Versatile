using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchChunks.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchChunks.Handlers;

public class GetResearchChunkByIdHandler : IRequestHandler<GetResearchChunkByIdQuery, ResearchChunkDto>
{
    private readonly IRepository<ResearchChunk> _repo;
    public GetResearchChunkByIdHandler(IRepository<ResearchChunk> repo) => _repo = repo;

    public async Task<ResearchChunkDto> Handle(GetResearchChunkByIdQuery request, CancellationToken ct)
    {
        var chunks = await _repo.GetAllAsync(
            c => c.Id == request.Id && c.UserId == request.UserId, ct);
        var chunk = chunks.FirstOrDefault() ?? throw new KeyNotFoundException("Research chunk not found");
        return new ResearchChunkDto(chunk.Id, chunk.StoryId, chunk.DocumentId, chunk.ChunkIndex, chunk.Content, chunk.Embedding!, chunk.CreatedAt);
    }
}
