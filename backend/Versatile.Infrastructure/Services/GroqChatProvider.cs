using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using Versatile.Application.DTOs;
using Versatile.Application.Services;

namespace Versatile.Infrastructure.Services;

public sealed class GroqChatProvider : IChatProvider
{
    private readonly HttpClient _http;
    private readonly string _apiKey;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public GroqChatProvider(HttpClient http, string apiKey)
    {
        _http = http;
        _apiKey = apiKey;
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

        using var req = new HttpRequestMessage(HttpMethod.Post, "v1/chat/completions")
        {
            Content = JsonContent.Create(body, options: JsonOptions),
        };
        req.Headers.Authorization = new("Bearer", _apiKey);

        using var response = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);

        while (true)
        {
            var line = await reader.ReadLineAsync(ct);
            if (line is null) break;
            if (string.IsNullOrEmpty(line)) continue;
            if (!line.StartsWith("data: ")) continue;

            var data = line[6..];
            if (data == "[DONE]") yield break;

            var chunk = JsonSerializer.Deserialize<GroqStreamChunk>(data, JsonOptions);
            if (chunk?.Choices is { Count: > 0 } choices)
            {
                var delta = choices[0].Delta;
                var finish = choices[0].FinishReason;
                if (delta?.Content is { Length: > 0 })
                    yield return new AiStreamChunk(delta.Content, finish);
                else if (finish is { Length: > 0 })
                    yield return new AiStreamChunk("", finish);
            }
        }
    }

    public async Task<TestConnectionResult> TestConnectionAsync(string model, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "v1/models");
        req.Headers.Authorization = new("Bearer", _apiKey);

        try
        {
            using var response = await _http.SendAsync(req, ct);
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
        using var req = new HttpRequestMessage(HttpMethod.Get, "v1/models");
        req.Headers.Authorization = new("Bearer", _apiKey);

        try
        {
            using var response = await _http.SendAsync(req, ct);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync(ct);
                return new ListModelsResult(false, [], error);
            }

            var json = await response.Content.ReadFromJsonAsync<GroqModelsResponse>(JsonOptions, ct);
            var models = json?.Data?.Select(m => new ModelInfo(m.Id, m.Id)).ToList() ?? [];
            return new ListModelsResult(true, models, null);
        }
        catch (Exception ex)
        {
            return new ListModelsResult(false, [], ex.Message);
        }
    }

    private sealed record GroqStreamChunk(IReadOnlyList<GroqChoice>? Choices);
    private sealed record GroqChoice(GroqDelta? Delta, string? FinishReason);
    private sealed record GroqDelta(string? Content);
    private sealed record GroqModelInfo(string Id);
    private sealed record GroqModelsResponse(IReadOnlyList<GroqModelInfo>? Data);
}
