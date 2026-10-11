using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SceneLabels.Commands;

public record UpsertSceneLabelCommand(
    Guid StoryId,
    string SceneTitle,
    string ReviewerName,
    string OverallLabel,
    Dictionary<string, string> DimensionLabels,
    Dictionary<string, int> DimensionScores,
    string? Notes,
    int WordCount,
    string? SceneExcerpt,
    Guid? OrganizationId,
    Guid UserId
) : IRequest<SceneLabelDto>, IRequiresOrganization;

public record DeleteSceneLabelCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<bool>, IRequiresOrganization;
