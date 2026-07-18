using MediatR;

namespace Versatile.Application.Scenes.Commands;

public record DeleteSceneCommand(Guid Id, Guid UserId) : IRequest<Unit>;
