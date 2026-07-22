using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.ResearchChunks.Queries;

public record GetResearchChunksQuery(Guid StoryId, Guid UserId) : IRequest<List<ResearchChunkDto>>;

public record GetResearchChunkByIdQuery(Guid Id, Guid UserId) : IRequest<ResearchChunkDto>;
