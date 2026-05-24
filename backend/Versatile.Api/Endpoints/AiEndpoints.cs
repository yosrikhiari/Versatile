using Versatile.Api.DTOs;
using Versatile.Api.Services;

namespace Versatile.Api.Endpoints;

public static class AiEndpoints
{
    public static void MapAiEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/ai").RequireAuthorization();

        group.MapPost("/generate", async (GenerateRequest req, AiProxyService ai) =>
        {
            var body = new
            {
                model = req.Model,
                prompt = req.Prompt,
                system = string.IsNullOrEmpty(req.System) ? null : req.System,
                stream = false
            };

            var response = await ai.ProxyGenerate(body);
            var content = await response.Content.ReadAsStringAsync();
            return Results.Content(content, "application/json", statusCode: (int)response.StatusCode);
        });

        group.MapPost("/embeddings", async (EmbeddingsRequest req, AiProxyService ai) =>
        {
            var body = new { model = req.Model, prompt = req.Prompt };
            var response = await ai.ProxyEmbeddings(body);
            var content = await response.Content.ReadAsStringAsync();
            return Results.Content(content, "application/json", statusCode: (int)response.StatusCode);
        });

        group.MapPost("/chat", async (ChatRequest req, AiProxyService ai) =>
        {
            var body = new { model = req.Model, messages = req.Messages, stream = false };
            var response = await ai.ProxyChat(body);
            var content = await response.Content.ReadAsStringAsync();
            return Results.Content(content, "application/json", statusCode: (int)response.StatusCode);
        });

        group.MapGet("/models", async (AiProxyService ai) =>
        {
            var response = await ai.ListModels();
            var content = await response.Content.ReadAsStringAsync();
            return Results.Content(content, "application/json", statusCode: (int)response.StatusCode);
        });
    }
}
