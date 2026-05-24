using System.Text;
using System.Text.Json;

namespace Versatile.Api.Services;

public class AiProxyService
{
    private readonly HttpClient _http;
    private readonly string _ollamaEndpoint;

    public AiProxyService(HttpClient http, IConfiguration config)
    {
        _http = http;
        _http.Timeout = TimeSpan.FromMinutes(5);
        _ollamaEndpoint = (config["Ollama:Endpoint"] ?? "http://localhost:11434").TrimEnd('/');
    }

    public async Task<HttpResponseMessage> ProxyGenerate(object body)
    {
        return await PostJson($"{_ollamaEndpoint}/api/generate", body);
    }

    public async Task<HttpResponseMessage> ProxyEmbeddings(object body)
    {
        return await PostJson($"{_ollamaEndpoint}/api/embeddings", body);
    }

    public async Task<HttpResponseMessage> ProxyChat(object body)
    {
        return await PostJson($"{_ollamaEndpoint}/api/chat", body);
    }

    public async Task<HttpResponseMessage> ListModels()
    {
        return await _http.GetAsync($"{_ollamaEndpoint}/api/tags");
    }

    private async Task<HttpResponseMessage> PostJson(string url, object body)
    {
        var json = JsonSerializer.Serialize(body);
        var content = new StringContent(json, Encoding.UTF8, "application/json");
        return await _http.PostAsync(url, content);
    }
}
