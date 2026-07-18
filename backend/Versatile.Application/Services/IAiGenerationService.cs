using System.Runtime.CompilerServices;
using Versatile.Application.DTOs;

namespace Versatile.Application.Services;

public interface IAiGenerationService
{
    IAsyncEnumerable<string> GenerateStoryContinuationAsync(GenerateContinuationRequest request, string userId, CancellationToken ct = default);
    IAsyncEnumerable<string> GenerateSuggestionAsync(GenerateSuggestionRequest request, string userId, CancellationToken ct = default);
    IAsyncEnumerable<string> GenerateCharacterProfileAsync(GenerateCharacterProfileRequest request, string userId, CancellationToken ct = default);
}
