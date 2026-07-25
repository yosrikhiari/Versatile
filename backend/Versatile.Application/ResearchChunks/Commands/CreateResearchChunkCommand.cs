using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchChunks.Commands;

public record CreateResearchChunkCommand(Guid DocumentId, Guid StoryId, int ChunkIndex, string? Content, string? Embedding, Guid? OrganizationId, Guid UserId) : IRequest<ResearchChunkDto>, IRequiresOrganization;
