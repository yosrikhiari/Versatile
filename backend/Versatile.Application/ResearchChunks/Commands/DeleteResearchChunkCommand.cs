using MediatR;

namespace Versatile.Application.ResearchChunks.Commands;

public record DeleteResearchChunkCommand(Guid Id, Guid UserId) : IRequest<Unit>;
