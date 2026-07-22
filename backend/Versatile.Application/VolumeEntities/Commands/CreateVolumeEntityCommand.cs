using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.VolumeEntities.Commands;

public record CreateVolumeEntityCommand(Guid StoryId, Guid VolumeId, string EntityType, string EntityId, bool IsPrimary, Guid? OrganizationId, Guid UserId) : IRequest<VolumeEntityDto>, IRequiresOrganization;
