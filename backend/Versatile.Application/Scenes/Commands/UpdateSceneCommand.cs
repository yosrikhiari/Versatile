using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Scenes.Commands;

public record UpdateSceneCommand(Guid Id, string? Title, string? Content, string? Status, int? Order, Guid UserId) : IRequest<SceneDto>;
