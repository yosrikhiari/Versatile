using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snapshots.Queries;

public record GetSnapshotsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<SnapshotDto>>, IRequiresOrganization;

public record GetSnapshotByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<SnapshotDto>, IRequiresOrganization;
