using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphGroups.Commands;

public record CreateGraphGroupCommand : IRequest<GraphGroupDto>
{
    public string Label { get; init; } = string.Empty;
    public string Color { get; init; } = string.Empty;
    public string? Data { get; init; }
    public Guid StoryId { get; set; }
    public Guid? OrganizationId { get; set; }
    public Guid UserId { get; set; }
}

public record UpdateGraphGroupCommand : IRequest<GraphGroupDto>
{
    public Guid Id { get; init; }
    public string? Label { get; init; }
    public string? Color { get; init; }
    public string? Data { get; init; }
    public Guid? OrganizationId { get; set; }
    public Guid UserId { get; set; }
}

public record DeleteGraphGroupCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
