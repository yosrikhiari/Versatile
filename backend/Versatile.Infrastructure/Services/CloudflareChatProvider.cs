using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using Versatile.Application.DTOs;
using Versatile.Application.Services;

namespace Versatile.Infrastructure.Services;

/// <summary>
/// Cloudflare Workers AI (https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/{model}).
/// Needs both an API token and the account ID the token belongs to; the account
/// ID comes from server configuration (Ai:Cloudflare:AccountId), the token is
/// per-user with an env fallback, like every other provider.
/// </summary>
public sealed class CloudflareChatProvider : IChatProvider
{
    private readonly HttpClient _http;
    private readonly string _apiToken;
    private readonly string _accountId;

    private const int MaxOutputTokens = 4096;
    private const double Temperature = 0.7;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    // Curated Workers AI text models. Workers AI has no stable models-list
    // endpoint, so the UI gets this fixed catalogue instead of a live query.
    public static readonly IReadOnlyList<string> KnownModels =
    [
        "@cf/meta/llama-3.1-8b-instruct",
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "@cf/mistral/mistral-7b-instruct-v0.2",
        "@cf/google/gemma-2-9b-it",
    ];

    public CloudflareChatProvider(HttpClient http, string apiToken, string accountId)
    {
        _http = http;
        _apiToken = apiToken;
        _accountId = accountId;
    }

    private string RunPath(string model) => $"accounts/{_accountId}/ai/run/{model}";

    public async IAsyncEnumerable<AiStreamChunk> GenerateStreamAsync(
        IReadOnlyList<AiMessage> messages, string model, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var body = new
        {
            messages = messages.Select(m => new { role = m.Role, content = m.Content }),
            max_tokens = MaxOutputTokens,
            temperature = Temperature,
            stream = true,
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, RunPath(model))
        {
            Content = JsonContent.Create(body, options: JsonOptions),
        };
        req.Headers.Authorization = new("Bearer", _apiToken);

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

            var chunk = JsonSerializer.Deserialize<CloudflareStreamChunk>(data, JsonOptions);
            if (!string.IsNullOrEmpty(chunk?.Response))
                yield return new AiStreamChunk(chunk.Response, null);
        }
    }

    public async Task<TestConnectionResult> TestConnectionAsync(string model, CancellationToken ct = default)
    {
        // Workers AI exposes no cheap ping endpoint, so send a 1-token probe.
        var probeModel = string.IsNullOrEmpty(model) ? KnownModels[0] : model;
        var body = new
        {
            messages = new[] { new { role = "user", content = "ping" } },
            max_tokens = 1,
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, RunPath(probeModel))
        {
            Content = JsonContent.Create(body, options: JsonOptions),
        };
        req.Headers.Authorization = new("Bearer", _apiToken);

        try
        {
            using var response = await _http.SendAsync(req, ct);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync(ct);
                return new TestConnectionResult(false, null, error);
            }
            return new TestConnectionResult(true, probeModel, null);
        }
        catch (Exception ex)
        {
            return new TestConnectionResult(false, null, ex.Message);
        }
    }

    public Task<ListModelsResult> ListModelsAsync(CancellationToken ct = default)
    {
        var models = KnownModels.Select(m => new ModelInfo(m, m)).ToList();
        return Task.FromResult(new ListModelsResult(true, models, null));
    }

    private sealed record CloudflareStreamChunk(string? Response);
}
