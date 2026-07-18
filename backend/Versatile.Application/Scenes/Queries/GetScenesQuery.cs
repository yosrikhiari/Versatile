using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Scenes.Queries;

public record GetScenesQuery(Guid ChapterId, Guid UserId) : IRequest<List<SceneDto>>;

public record GetSceneByIdQuery(Guid Id, Guid UserId) : IRequest<SceneDto>;
