using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchChunks.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchChunks.Handlers;

public class CreateResearchChunkHandler : IRequestHandler<CreateResearchChunkCommand, ResearchChunkDto>
{
    private readonly IRepository<ResearchChunk> _repo;
    private readonly IRepository<ResearchDocument> _docRepo;
    private readonly IUnitOfWork _uow;

    public CreateResearchChunkHandler(IRepository<ResearchChunk> repo, IRepository<ResearchDocument> docRepo, IUnitOfWork uow)
    {
        _repo = repo;
        _docRepo = docRepo;
        _uow = uow;
    }

    public async Task<ResearchChunkDto> Handle(CreateResearchChunkCommand request, CancellationToken ct)
    {
        var docs = await _docRepo.GetAllAsync(
            d => d.Id == request.DocumentId && d.UserId == request.UserId, ct);
        if (docs.Count == 0) throw new KeyNotFoundException("Research document not found");

        var chunk = new ResearchChunk
        {
            DocumentId = request.DocumentId,
            StoryId = request.StoryId,
            ChunkIndex = request.ChunkIndex,
            Content = request.Content,
            Embedding = request.Embedding,
            UserId = request.UserId
        };
        await _repo.AddAsync(chunk, ct);
        await _uow.SaveChangesAsync(ct);
        return new ResearchChunkDto(chunk.Id, chunk.StoryId, chunk.DocumentId, chunk.ChunkIndex, chunk.Content, chunk.Embedding!, chunk.CreatedAt);
    }
}
