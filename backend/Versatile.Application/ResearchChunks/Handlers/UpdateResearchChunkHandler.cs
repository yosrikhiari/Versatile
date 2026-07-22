using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchChunks.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchChunks.Handlers;

public class UpdateResearchChunkHandler : IRequestHandler<UpdateResearchChunkCommand, ResearchChunkDto>
{
    private readonly IRepository<ResearchChunk> _repo;
    private readonly IUnitOfWork _uow;

    public UpdateResearchChunkHandler(IRepository<ResearchChunk> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<ResearchChunkDto> Handle(UpdateResearchChunkCommand request, CancellationToken ct)
    {
        var chunks = await _repo.GetAllAsync(
            c => c.Id == request.Id && c.UserId == request.UserId, ct);
        var chunk = chunks.FirstOrDefault() ?? throw new KeyNotFoundException("Research chunk not found");

        if (request.ChunkIndex.HasValue) chunk.ChunkIndex = request.ChunkIndex.Value;
        if (request.Content is not null) chunk.Content = request.Content;
        if (request.Embedding is not null) chunk.Embedding = request.Embedding;
        chunk.UpdatedAt = DateTime.UtcNow;

        _repo.Update(chunk);
        await _uow.SaveChangesAsync(ct);
        return new ResearchChunkDto(chunk.Id, chunk.StoryId, chunk.DocumentId, chunk.ChunkIndex, chunk.Content, chunk.Embedding!, chunk.CreatedAt);
    }
}
