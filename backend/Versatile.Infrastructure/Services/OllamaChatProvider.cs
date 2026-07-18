using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using Versatile.Application.DTOs;
using Versatile.Application.Services;

namespace Versatile.Infrastructure.Services;

public sealed class OllamaChatProvider : IChatProvider
{
    private readonly HttpClient _http;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public OllamaChatProvider(HttpClient http)
    {
        _http = http;
    }

    public async IAsyncEnumerable<AiStreamChunk> GenerateStreamAsync(
        IReadOnlyList<AiMessage> messages, string model, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var body = new
        {
            model,
            messages = messages.Select(m => new { role = m.Role, content = m.Content }),
            stream = true,
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, "api/chat")
        {
            Content = JsonContent.Create(body, options: JsonOptions),
        };

        using var response = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);

        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync(ct);
            if (string.IsNullOrEmpty(line)) continue;

            var chunk = JsonSerializer.Deserialize<OllamaStreamChunk>(line, JsonOptions);
            if (chunk?.Done == true)
            {
                yield return new AiStreamChunk("", "stop");
                yield break;
            }

            if (chunk?.Message?.Content is { Length: > 0 } text)
                yield return new AiStreamChunk(text, null);
        }
    }

    public async Task<TestConnectionResult> TestConnectionAsync(string model, CancellationToken ct = default)
    {
        try
        {
            using var response = await _http.GetAsync("api/tags", ct);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync(ct);
                return new TestConnectionResult(false, null, error);
            }
            return new TestConnectionResult(true, model, null);
        }
        catch (Exception ex)
        {
            return new TestConnectionResult(false, null, ex.Message);
        }
    }

    public async Task<ListModelsResult> ListModelsAsync(CancellationToken ct = default)
    {
        try
        {
            using var response = await _http.GetAsync("api/tags", ct);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync(ct);
                return new ListModelsResult(false, [], error);
            }

            var json = await response.Content.ReadFromJsonAsync<OllamaTagsResponse>(JsonOptions, ct);
            var models = json?.Models?
                .Select(m => new ModelInfo(m.Name, m.Name))
                .ToList() ?? [];
            return new ListModelsResult(true, models, null);
        }
        catch (Exception ex)
        {
            return new ListModelsResult(false, [], ex.Message);
        }
    }

    private sealed record OllamaStreamChunk(OllamaMessage? Message, bool Done);
    private sealed record OllamaMessage(string Content);
    private sealed record OllamaModelInfo(string Name);
    private sealed record OllamaTagsResponse(IReadOnlyList<OllamaModelInfo>? Models);
}
