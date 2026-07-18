using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using Versatile.Application.DTOs;
using Versatile.Application.Services;

namespace Versatile.Infrastructure.Services;

public sealed class GeminiChatProvider : IChatProvider
{
    private readonly HttpClient _http;
    private readonly string _apiKey;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public GeminiChatProvider(HttpClient http, string apiKey)
    {
        _http = http;
        _apiKey = apiKey;
    }

    public async IAsyncEnumerable<AiStreamChunk> GenerateStreamAsync(
        IReadOnlyList<AiMessage> messages, string model, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var system = string.Join("\n", messages.Where(m => m.Role == "system").Select(m => m.Content));
        var contents = messages.Where(m => m.Role != "system")
            .Select(m => new GeminiContent(m.Role == "assistant" ? "model" : "user", new[] { new GeminiPart(m.Content) }))
            .ToList();

        var body = new
        {
            contents,
            system_instruction = string.IsNullOrEmpty(system) ? null : new { parts = new[] { new { text = system } } },
        };

        var url = $"{model}:streamGenerateContent?alt=sse&key={_apiKey}";

        using var req = new HttpRequestMessage(HttpMethod.Post, url)
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
            if (!line.StartsWith("data: ")) continue;

            var data = line[6..];
            if (data.Trim().Length == 0) yield break;

            var chunk = JsonSerializer.Deserialize<GeminiResponse>(data, JsonOptions);
            if (chunk?.Candidates is { Count: > 0 } candidates)
            {
                var text = candidates[0]?.Content?.Parts?.FirstOrDefault()?.Text;
                if (!string.IsNullOrEmpty(text))
                    yield return new AiStreamChunk(text, null);

                var finish = candidates[0]?.FinishReason;
                if (!string.IsNullOrEmpty(finish))
                    yield return new AiStreamChunk("", finish);
            }
        }
    }

    public async Task<TestConnectionResult> TestConnectionAsync(string model, CancellationToken ct = default)
    {
        var url = $"{model}:generateContent?key={_apiKey}";
        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(new
            {
                contents = new[] { new { role = "user", parts = new[] { new { text = "ping" } } } },
            }, options: JsonOptions),
        };

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
        try
        {
            using var response = await _http.GetAsync($"models?key={_apiKey}", ct);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync(ct);
                return new ListModelsResult(false, [], error);
            }

            var json = await response.Content.ReadFromJsonAsync<GeminiModelsResponse>(JsonOptions, ct);
            var models = json?.Models
                ?.Where(m => m.Name?.StartsWith("models/gemini") == true)
                .Select(m => new ModelInfo(m.Name!.Replace("models/", ""), m.DisplayName ?? m.Name))
                .ToList() ?? [];
            return new ListModelsResult(true, models, null);
        }
        catch (Exception ex)
        {
            return new ListModelsResult(false, [], ex.Message);
        }
    }

    private sealed record GeminiContent(string Role, IReadOnlyList<GeminiPart> Parts);
    private sealed record GeminiPart(string Text);
    private sealed record GeminiResponse(IReadOnlyList<GeminiCandidate>? Candidates);
    private sealed record GeminiCandidate(GeminiContent? Content, string? FinishReason);
    private sealed record GeminiModelInfo(string? Name, string? DisplayName, string? SupportedGenerationMethods);
    private sealed record GeminiModelsResponse(IReadOnlyList<GeminiModelInfo>? Models);
}
