using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class ResearchDocument : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [MaxLength(500)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string FileType { get; set; } = string.Empty;

    public DateTime ImportedAt { get; set; }

    public string? Content { get; set; }

    public string? Notes { get; set; }
}
