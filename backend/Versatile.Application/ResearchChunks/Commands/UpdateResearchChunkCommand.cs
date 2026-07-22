using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.ResearchChunks.Commands;

public record UpdateResearchChunkCommand(Guid Id, int? ChunkIndex, string? Content, string? Embedding, Guid UserId) : IRequest<ResearchChunkDto>;
