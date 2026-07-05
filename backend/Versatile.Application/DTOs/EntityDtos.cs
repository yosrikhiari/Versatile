namespace Versatile.Application.DTOs;

public record EntityDto(
    Guid Id,
    Guid StoryId,
    string Name,
    string Type,
    string Description,
    string? Metadata,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateEntityRequest(string Name, string Type, string Description, string? Metadata);
public record UpdateEntityRequest(string? Name, string? Type, string? Description, string? Metadata);
