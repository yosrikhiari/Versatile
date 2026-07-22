using MediatR;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Volume.Queries;

public record GetVolumesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId, int Page = 1, int PageSize = 20) : IPagedQuery<VolumeDto>, IRequiresOrganization;
public record GetVolumeByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<VolumeDto>, IRequiresOrganization;
