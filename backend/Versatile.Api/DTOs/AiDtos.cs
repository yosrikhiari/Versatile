using System.Text.Json.Serialization;

namespace Versatile.Api.DTOs;

public class GenerateRequest
{
    public string Model { get; set; } = string.Empty;
    public string Prompt { get; set; } = string.Empty;
    public string System { get; set; } = string.Empty;
    public bool Stream { get; set; }
}

public class EmbeddingsRequest
{
    public string Model { get; set; } = string.Empty;
    public string Prompt { get; set; } = string.Empty;
}

public class ChatRequest
{
    public string Model { get; set; } = string.Empty;
    public object Messages { get; set; } = new { };
    public bool Stream { get; set; }
}
