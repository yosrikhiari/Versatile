namespace Versatile.Application.DTOs;

public record ResearchDto(
    Guid Id,
    Guid StoryId,
    string Title,
    string Content,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateResearchRequest(string Title, string Content);
public record UpdateResearchRequest(string? Title, string? Content);

public record BibleEntryDto(
    Guid Id,
    Guid StoryId,
    string Title,
    string Content,
    string? Category,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateBibleEntryRequest(string Title, string Content, string? Category);
public record UpdateBibleEntryRequest(string? Title, string? Content, string? Category);
