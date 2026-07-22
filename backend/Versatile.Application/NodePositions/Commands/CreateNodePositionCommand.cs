using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.NodePositions.Commands;

public record CreateNodePositionCommand(Guid StoryId, string NodeId, string NodeType, double X, double Y, Guid? OrganizationId, Guid UserId) : IRequest<NodePositionDto>, IRequiresOrganization;
