namespace Versatile.Application.DTOs;

public record FlowDto(
    Guid Id,
    Guid StoryId,
    string Nodes,
    string Edges,
    string? Viewport,
    DateTime UpdatedAt
);

public record UpdateFlowRequest(string Nodes, string Edges, string? Viewport);
