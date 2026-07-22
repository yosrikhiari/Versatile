using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.ResearchChunks.Commands;

public record CreateResearchChunkCommand(Guid DocumentId, Guid StoryId, int ChunkIndex, string? Content, string? Embedding, Guid UserId) : IRequest<ResearchChunkDto>;
