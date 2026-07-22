using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Flows.Commands;

public record UpdateFlowCommand(Guid StoryId, string Nodes, string Edges, string? Viewport, Guid? OrganizationId, Guid UserId) : IRequest<FlowDto>, IRequiresOrganization;
