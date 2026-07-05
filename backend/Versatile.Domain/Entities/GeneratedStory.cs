using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class GeneratedStory
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string? Content { get; set; }

    public DateTime GeneratedAt { get; set; }

    public int TotalWords { get; set; }

    public double? QualityScore { get; set; }
}
