namespace Versatile.Application.DTOs;

public record SceneLabelDto(
    Guid Id,
    Guid StoryId,
    string SceneTitle,
    string ReviewerName,
    string OverallLabel,
    Dictionary<string, string> DimensionLabels,
    Dictionary<string, int> DimensionScores,
    string? Notes,
    int WordCount,
    string? SceneExcerpt,
    DateTime CreatedAt
);
