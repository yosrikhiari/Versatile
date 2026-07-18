using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Volume.Queries;

public record GetVolumesQuery(Guid StoryId, Guid UserId) : IRequest<List<VolumeDto>>;
public record GetVolumeByIdQuery(Guid Id, Guid UserId) : IRequest<VolumeDto>;
