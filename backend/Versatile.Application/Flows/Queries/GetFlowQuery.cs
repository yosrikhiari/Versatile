using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Flows.Queries;

public record GetFlowQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<FlowDto>, IRequiresOrganization;
