using MediatR;

namespace Versatile.Application.Volume.Commands;

public record DeleteVolumeCommand(Guid Id, Guid UserId) : IRequest<Unit>;
