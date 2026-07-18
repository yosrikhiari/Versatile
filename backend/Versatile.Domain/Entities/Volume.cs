using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class Volume : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    [MaxLength(50)]
    public string Color { get; set; } = string.Empty;

    public int SortOrder { get; set; }

    public string? ChapterIds { get; set; }
}
