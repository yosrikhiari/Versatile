using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchChunks.Commands;

public record DeleteResearchChunkCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
