namespace Versatile.Application.DTOs;

public record StoryDto(
    Guid Id,
    string Title,
    string? Premise,
    string? Genre,
    string? Tone,
    string? WritingStyle,
    string? TargetAudience,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateStoryRequest(
    string Title,
    string? Premise,
    string? Genre,
    string? Tone,
    string? WritingStyle,
    string? TargetAudience
);

public record UpdateStoryRequest(
    string? Title,
    string? Premise,
    string? Genre,
    string? Tone,
    string? WritingStyle,
    string? TargetAudience
);

public record ChapterDto(
    Guid Id,
    Guid StoryId,
    string Title,
    int Order,
    string Status,
    string? ArcAssignment,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateChapterRequest(string Title, int Order, string? ArcAssignment);
public record UpdateChapterRequest(string? Title, int? Order, string? Status, string? ArcAssignment);

public record SceneDto(
    Guid Id,
    Guid ChapterId,
    string Title,
    string Content,
    string Status,
    int WordCount,
    int Order,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateSceneRequest(string Title, string Content, int Order);
public record UpdateSceneRequest(string? Title, string? Content, string? Status, int? Order);
