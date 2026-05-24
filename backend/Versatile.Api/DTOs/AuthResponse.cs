using System.Text.Json.Serialization;

namespace Versatile.Api.DTOs;

public class AuthResponse
{
    public string Token { get; set; } = string.Empty;

    [JsonPropertyName("user_id")]
    public string UserId { get; set; } = string.Empty;

    [JsonPropertyName("display_name")]
    public string DisplayName { get; set; } = string.Empty;
}
