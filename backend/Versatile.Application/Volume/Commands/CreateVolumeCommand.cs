using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Volume.Commands;

public record CreateVolumeCommand(Guid StoryId, string Title, string? Description, string? Color, int? SortOrder, string? ChapterIds, Guid? OrganizationId, Guid UserId) : IRequest<VolumeDto>, IRequiresOrganization;
