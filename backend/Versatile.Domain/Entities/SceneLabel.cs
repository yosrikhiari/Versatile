using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace Versatile.Domain.Entities;

public class SceneLabel : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [Required]
    [MaxLength(200)]
    public string SceneTitle { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string ReviewerName { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string OverallLabel { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? DimensionLabelsJson { get; set; }

    [MaxLength(4000)]
    public string? DimensionScoresJson { get; set; }

    [MaxLength(2000)]
    public string? Notes { get; set; }

    public int WordCount { get; set; }

    [MaxLength(500)]
    public string? SceneExcerpt { get; set; }

    [JsonIgnore, System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public Dictionary<string, string> DimensionLabels
    {
        get => string.IsNullOrEmpty(DimensionLabelsJson)
            ? new()
            : System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(DimensionLabelsJson) ?? new();
        set => DimensionLabelsJson = System.Text.Json.JsonSerializer.Serialize(value);
    }

    [JsonIgnore, System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public Dictionary<string, int> DimensionScores
    {
        get => string.IsNullOrEmpty(DimensionScoresJson)
            ? new()
            : System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, int>>(DimensionScoresJson) ?? new();
        set => DimensionScoresJson = System.Text.Json.JsonSerializer.Serialize(value);
    }
}
