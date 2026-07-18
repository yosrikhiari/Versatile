using Versatile.Application.DTOs;

namespace Versatile.Application.Services;

public interface IChatProvider
{
    IAsyncEnumerable<AiStreamChunk> GenerateStreamAsync(
        IReadOnlyList<AiMessage> messages,
        string model,
        CancellationToken ct = default);

    Task<TestConnectionResult> TestConnectionAsync(string model, CancellationToken ct = default);

    Task<ListModelsResult> ListModelsAsync(CancellationToken ct = default);
}
