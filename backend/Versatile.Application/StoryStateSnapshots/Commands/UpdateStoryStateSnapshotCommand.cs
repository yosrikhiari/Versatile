using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryStateSnapshots.Commands;

public record UpdateStoryStateSnapshotCommand(Guid Id, string? Data, Guid? OrganizationId, Guid UserId) : IRequest<StoryStateSnapshotDto>, IRequiresOrganization;
