namespace Versatile.Application.DTOs;

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
