namespace Versatile.Application.DTOs;

public record GenerateContinuationRequest(
    string StoryId,
    string RecentContent,
    string Provider,
    string Model,
    string? Genre,
    string? Tone,
    string? WritingStyle
);

public record GenerateSuggestionRequest(
    string StoryId,
    string Context,
    string Focus,
    string Provider,
    string Model
);

public record GenerateCharacterProfileRequest(
    string StoryId,
    string Name,
    string Provider,
    string Model,
    string? Archetype,
    string? Role
);
