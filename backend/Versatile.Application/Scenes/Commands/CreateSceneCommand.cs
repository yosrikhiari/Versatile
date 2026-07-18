using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Scenes.Commands;

public record CreateSceneCommand(Guid ChapterId, string Title, string Content, int Order, Guid UserId) : IRequest<SceneDto>;
