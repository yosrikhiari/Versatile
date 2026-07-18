using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class SparkHistoryItem : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [MaxLength(100)]
    public string Type { get; set; } = string.Empty;

    public string? Prompt { get; set; }

    public string? Blueprint { get; set; }

    public string? GeneratedContent { get; set; }
}
