using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class Annotation : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    public int ParagraphIndex { get; set; }

    [MaxLength(100)]
    public string? ParagraphId { get; set; }

    [MaxLength(50)]
    public string Type { get; set; } = string.Empty;

    public string? Original { get; set; }

    public string? Suggestion { get; set; }

    public string? Reason { get; set; }

    [MaxLength(50)]
    public string Status { get; set; } = string.Empty;
}
