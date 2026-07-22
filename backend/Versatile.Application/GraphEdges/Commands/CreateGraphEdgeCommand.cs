using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphEdges.Commands;

public record CreateGraphEdgeCommand : IRequest<GraphEdgeDto>
{
    public string SourceId { get; init; } = string.Empty;
    public string TargetId { get; init; } = string.Empty;
    public string SourceType { get; init; } = string.Empty;
    public string TargetType { get; init; } = string.Empty;
    public string RelationshipType { get; init; } = string.Empty;
    public string? Label { get; init; }
    public Guid? VolumeId { get; init; }
    public Guid StoryId { get; set; }
    public Guid? OrganizationId { get; set; }
    public Guid UserId { get; set; }
}

public record UpdateGraphEdgeCommand : IRequest<GraphEdgeDto>
{
    public Guid Id { get; init; }
    public string? SourceId { get; init; }
    public string? TargetId { get; init; }
    public string? SourceType { get; init; }
    public string? TargetType { get; init; }
    public string? RelationshipType { get; init; }
    public string? Label { get; init; }
    public Guid? VolumeId { get; init; }
    public Guid? OrganizationId { get; set; }
    public Guid UserId { get; set; }
}

public record DeleteGraphEdgeCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
