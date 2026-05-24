using System.Text.Json.Serialization;

namespace Versatile.Api.DTOs;

public class SyncPullRequest
{
    public DateTime Since { get; set; }
}

public class SyncPullResponse
{
    public List<SyncEntity> Entities { get; set; } = [];
    [JsonPropertyName("server_at")]
    public DateTime ServerAt { get; set; }
}

public class SyncPushRequest
{
    public List<SyncEntity> Entities { get; set; } = [];
}

public class SyncPushResponse
{
    public int Accepted { get; set; }
}

public class SyncEntity
{
    public string Table { get; set; } = string.Empty;
    public string Id { get; set; } = string.Empty;
    public string Data { get; set; } = string.Empty;
    [JsonPropertyName("updated_at")]
    public DateTime UpdatedAt { get; set; }
    [JsonPropertyName("deleted_at")]
    public DateTime? DeletedAt { get; set; }
}
