using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snapshots.Commands;

public record CreateSnapshotCommand(Guid StoryId, Guid? ChapterId, DateTime Timestamp, string? Label, string? Data, Guid? OrganizationId, Guid UserId) : IRequest<SnapshotDto>, IRequiresOrganization;
