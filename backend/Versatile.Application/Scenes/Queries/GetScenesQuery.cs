using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Scenes.Queries;

public record GetScenesQuery(Guid ChapterId, Guid? OrganizationId, Guid UserId) : IRequest<List<SceneDto>>, IRequiresOrganization;

public record GetSceneByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<SceneDto>, IRequiresOrganization;
