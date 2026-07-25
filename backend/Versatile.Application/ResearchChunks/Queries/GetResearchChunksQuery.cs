using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchChunks.Queries;

public record GetResearchChunksQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<ResearchChunkDto>>, IRequiresOrganization;

public record GetResearchChunkByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<ResearchChunkDto>, IRequiresOrganization;
