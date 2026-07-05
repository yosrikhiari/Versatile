namespace Versatile.Application.DTOs;

public record GenerateContinuationRequest(
    string StoryId,
    string RecentContent,
    string? Genre,
    string? Tone,
    string? WritingStyle
);

public record GenerateSuggestionRequest(
    string StoryId,
    string Context,
    string Focus
);

public record GenerateCharacterProfileRequest(
    string StoryId,
    string Name,
    string? Archetype,
    string? Role
);
