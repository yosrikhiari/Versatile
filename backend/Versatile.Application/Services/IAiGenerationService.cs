using System.Runtime.CompilerServices;
using Versatile.Application.DTOs;

namespace Versatile.Application.Services;

public interface IAiGenerationService
{
    IAsyncEnumerable<string> GenerateStoryContinuationAsync(GenerateContinuationRequest request, CancellationToken ct = default);
    IAsyncEnumerable<string> GenerateSuggestionAsync(GenerateSuggestionRequest request, CancellationToken ct = default);
    IAsyncEnumerable<string> GenerateCharacterProfileAsync(GenerateCharacterProfileRequest request, CancellationToken ct = default);
}
