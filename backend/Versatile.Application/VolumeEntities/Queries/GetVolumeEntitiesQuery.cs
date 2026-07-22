using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.VolumeEntities.Queries;

public record GetVolumeEntitiesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<VolumeEntityDto>>, IRequiresOrganization;
public record GetVolumeEntityByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<VolumeEntityDto>, IRequiresOrganization;
