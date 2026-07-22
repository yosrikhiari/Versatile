using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryStateSnapshots.Commands;

public record CreateStoryStateSnapshotCommand(Guid StoryId, DateTime Timestamp, string? Data, Guid? OrganizationId, Guid UserId) : IRequest<StoryStateSnapshotDto>, IRequiresOrganization;
