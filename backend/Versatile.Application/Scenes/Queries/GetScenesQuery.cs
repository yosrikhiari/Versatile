using MediatR;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Scenes.Queries;

public record GetScenesQuery(Guid ChapterId, Guid? OrganizationId, Guid UserId, int Page = 1, int PageSize = 20) : IPagedQuery<SceneDto>, IRequiresOrganization;

public record GetSceneByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<SceneDto>, IRequiresOrganization;
