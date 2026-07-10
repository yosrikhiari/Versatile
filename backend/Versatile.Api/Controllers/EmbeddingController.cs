using Microsoft.AspNetCore.Mvc;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/embedding")]
public class EmbeddingController : ControllerBase
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;

    public EmbeddingController(HttpClient http, IConfiguration config)
    {
        _http = http;
        _config = config;
    }

    [HttpPost("mistral")]
    public async Task<IActionResult> MistralEmbed([FromBody] MistralEmbedRequest request)
    {
        var apiKey = _config["Ai:MistralKey"];
        if (string.IsNullOrEmpty(apiKey))
            return BadRequest(new { error = "Mistral API key not configured on server" });

        var mistralRequest = new
        {
            model = request.Model ?? "mistral-embed",
            input = request.Input
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.mistral.ai/v1/embeddings")
        {
            Content = JsonContent.Create(mistralRequest)
        };
        httpRequest.Headers.Add("Authorization", $"Bearer {apiKey}");

        using var response = await _http.SendAsync(httpRequest);
        var body = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
            return StatusCode((int)response.StatusCode, body);

        return Content(body, "application/json");
    }
}

public record MistralEmbedRequest(string? Model, string[] Input);
