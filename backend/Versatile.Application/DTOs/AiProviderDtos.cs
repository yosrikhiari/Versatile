namespace Versatile.Application.DTOs;

public record AiMessage(string Role, string Content);

public record AiStreamChunk(string Text, string? FinishReason);

public record TestConnectionResult(bool Success, string? Model, string? Error);

public record ModelInfo(string Id, string? Name);

public record ListModelsResult(bool Success, IReadOnlyList<ModelInfo> Models, string? Error);

public record TestConnectionRequest(string Provider, string Model);
