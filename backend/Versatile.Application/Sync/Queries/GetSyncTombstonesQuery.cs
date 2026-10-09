using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Sync.Queries;

public record GetSyncTombstonesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId)
    : IRequest<List<SyncTombstoneDto>>, IRequiresOrganization;
