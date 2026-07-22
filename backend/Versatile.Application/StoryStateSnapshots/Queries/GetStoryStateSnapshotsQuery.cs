using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryStateSnapshots.Queries;

public record GetStoryStateSnapshotsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<StoryStateSnapshotDto>>, IRequiresOrganization;
public record GetStoryStateSnapshotByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<StoryStateSnapshotDto>, IRequiresOrganization;
