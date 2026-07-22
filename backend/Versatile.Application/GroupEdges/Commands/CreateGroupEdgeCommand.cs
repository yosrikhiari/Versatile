using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GroupEdges.Commands;

public record CreateGroupEdgeCommand : IRequest<GroupEdgeDto>
{
    public string SourceGroupId { get; init; } = string.Empty;
    public string TargetGroupId { get; init; } = string.Empty;
    public string RelationshipType { get; init; } = string.Empty;
    public Guid StoryId { get; set; }
    public Guid? OrganizationId { get; set; }
    public Guid UserId { get; set; }
}

public record UpdateGroupEdgeCommand : IRequest<GroupEdgeDto>
{
    public Guid Id { get; init; }
    public string? SourceGroupId { get; init; }
    public string? TargetGroupId { get; init; }
    public string? RelationshipType { get; init; }
    public Guid? OrganizationId { get; set; }
    public Guid UserId { get; set; }
}

public record DeleteGroupEdgeCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
