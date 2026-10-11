using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SceneLabels.Queries;

public record GetSceneLabelsQuery(Guid? StoryId, string? ReviewerName, Guid? OrganizationId, Guid UserId)
    : IRequest<List<SceneLabelDto>>, IRequiresOrganization;

public record GetSceneLabelByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId)
    : IRequest<SceneLabelDto>, IRequiresOrganization;
