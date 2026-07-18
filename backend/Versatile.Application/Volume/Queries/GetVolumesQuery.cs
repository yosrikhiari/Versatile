using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Volume.Queries;

public record GetVolumesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<VolumeDto>>, IRequiresOrganization;
public record GetVolumeByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<VolumeDto>, IRequiresOrganization;
