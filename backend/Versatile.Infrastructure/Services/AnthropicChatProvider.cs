using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using Versatile.Application.DTOs;
using Versatile.Application.Services;

namespace Versatile.Infrastructure.Services;

public sealed class AnthropicChatProvider : IChatProvider
{
    private readonly HttpClient _http;
    private readonly string _apiKey;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public AnthropicChatProvider(HttpClient http, string apiKey)
    {
        _http = http;
        _apiKey = apiKey;
    }

    public async IAsyncEnumerable<AiStreamChunk> GenerateStreamAsync(
        IReadOnlyList<AiMessage> messages, string model, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var system = string.Join("\n", messages.Where(m => m.Role == "system").Select(m => m.Content));
        var userMessages = messages.Where(m => m.Role != "system").Select(m => new
        {
            role = m.Role,
            content = new[] { new { type = "text", text = m.Content } },
        }).ToList();

        var body = new
        {
            model,
            max_tokens = 4096,
            system = string.IsNullOrEmpty(system) ? null : system,
            messages = userMessages,
            stream = true,
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, "v1/messages")
        {
            Content = JsonContent.Create(body, options: JsonOptions),
        };
        req.Headers.Add("x-api-key", _apiKey);
        req.Headers.Add("anthropic-version", "2023-06-01");

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

            var chunk = JsonSerializer.Deserialize<AnthropicStreamEvent>(data, JsonOptions);
            if (chunk?.Type == "content_block_delta" && chunk.Delta?.Type == "text_delta")
            {
                yield return new AiStreamChunk(chunk.Delta.Text ?? "", null);
            }
            else if (chunk?.Type == "message_stop")
            {
                yield return new AiStreamChunk("", "stop");
            }
        }
    }

    public async Task<TestConnectionResult> TestConnectionAsync(string model, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "v1/messages")
        {
            Content = JsonContent.Create(new
            {
                model,
                max_tokens = 10,
                messages = new[] { new { role = "user", content = new[] { new { type = "text", text = "ping" } } } },
            }, options: JsonOptions),
        };
        req.Headers.Add("x-api-key", _apiKey);
        req.Headers.Add("anthropic-version", "2023-06-01");

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

    public Task<ListModelsResult> ListModelsAsync(CancellationToken ct = default)
    {
        var models = new[] { "claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022" }
            .Select(m => new ModelInfo(m, m)).ToList();
        return Task.FromResult(new ListModelsResult(true, models, null));
    }

    private sealed record AnthropicStreamEvent(string? Type, AnthropicDelta? Delta);
    private sealed record AnthropicDelta(string? Type, string? Text);
}
