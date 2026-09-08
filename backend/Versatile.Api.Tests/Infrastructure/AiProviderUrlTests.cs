using System.Net;
using System.Text;
using FluentAssertions;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Tests.Infrastructure;

/// <summary>
/// Pins the <see cref="AiProviderFactory"/> URL contract: every BaseAddress ends
/// with '/' and every provider-relative path is a bare suffix (no leading '/',
/// no version prefix), so HttpClient can never merge them into a double-/v1/ URL.
/// If you touch a base URL or a relative path, update these literals.
/// </summary>
public class AiProviderUrlTests
{
    private sealed class CaptureHandler : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }
        private readonly HttpResponseMessage _response;

        public CaptureHandler(string json) => _response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            LastRequest = request;
            return Task.FromResult(_response);
        }
    }

    private static (T Provider, CaptureHandler Handler) Create<T>(string baseUrl, Func<HttpClient, T> create, string json = "{}")
    {
        var handler = new CaptureHandler(json);
        var http = new HttpClient(handler) { BaseAddress = new Uri(baseUrl) };
        return (create(http), handler);
    }

    [Fact]
    public async Task OpenAi_TestConnection_HitsVersionedModelsPath()
    {
        var (provider, handler) = Create("https://api.openai.com/v1/", http => new OpenAiChatProvider(http, "k"));

        await provider.TestConnectionAsync("gpt-4o-mini");

        handler.LastRequest!.Method.Should().Be(HttpMethod.Get);
        handler.LastRequest!.RequestUri!.AbsoluteUri.Should().Be("https://api.openai.com/v1/models");
    }

    [Fact]
    public async Task OpenAi_ListModels_HitsVersionedModelsPath()
    {
        var (provider, handler) = Create("https://api.openai.com/v1/",
            http => new OpenAiChatProvider(http, "k"),
            """{"data":[{"id":"gpt-4o-mini"}]}""");

        var result = await provider.ListModelsAsync();

        handler.LastRequest!.RequestUri!.AbsoluteUri.Should().Be("https://api.openai.com/v1/models");
        result.Success.Should().BeTrue();
        result.Models.Should().ContainSingle(m => m.Id == "gpt-4o-mini");
    }

    [Fact]
    public async Task Anthropic_TestConnection_HitsVersionedMessagesPath()
    {
        var (provider, handler) = Create("https://api.anthropic.com/v1/", http => new AnthropicChatProvider(http, "k"));

        var result = await provider.TestConnectionAsync("claude-sonnet-4-20250514");

        handler.LastRequest!.Method.Should().Be(HttpMethod.Post);
        handler.LastRequest!.RequestUri!.AbsoluteUri.Should().Be("https://api.anthropic.com/v1/messages");
        result.Success.Should().BeTrue();
    }

    [Fact]
    public async Task Groq_TestConnection_HitsVersionedModelsPath()
    {
        var (provider, handler) = Create("https://api.groq.com/openai/v1/", http => new GroqChatProvider(http, "k"));

        await provider.TestConnectionAsync("llama-3.3-70b-versatile");

        handler.LastRequest!.Method.Should().Be(HttpMethod.Get);
        handler.LastRequest!.RequestUri!.AbsoluteUri.Should().Be("https://api.groq.com/openai/v1/models");
    }

    [Fact]
    public async Task Gemini_ListModels_HitsModelsRoot_WithoutDoubledSegment()
    {
        var (provider, handler) = Create("https://generativelanguage.googleapis.com/v1beta/models/",
            http => new GeminiChatProvider(http, "k"),
            """{"models":[{"name":"models/gemini-1.5-flash","displayName":"Gemini Flash","supportedGenerationMethods":[]}]}""");

        var result = await provider.ListModelsAsync();

        // Regression: the relative was "models?key=" against a base already
        // ending in "models/", producing .../models/models (404 at Google).
        handler.LastRequest!.RequestUri!.AbsolutePath.Should().Be("/v1beta/models/");
        handler.LastRequest!.RequestUri!.AbsoluteUri.Should().NotContain("models/models");
        result.Success.Should().BeTrue();
        result.Models.Should().ContainSingle(m => m.Id == "gemini-1.5-flash");
    }

    [Fact]
    public async Task Ollama_ListModels_HitsApiTags()
    {
        // Base mirrors the factory's normalized output (TrimEnd('/') + "/").
        var (provider, handler) = Create("http://localhost:11434/",
            http => new OllamaChatProvider(http),
            """{"models":[{"name":"qwen3:8b"}]}""");

        var result = await provider.ListModelsAsync();

        handler.LastRequest!.RequestUri!.AbsoluteUri.Should().Be("http://localhost:11434/api/tags");
        result.Success.Should().BeTrue();
        result.Models.Should().ContainSingle(m => m.Id == "qwen3:8b");
    }
}
