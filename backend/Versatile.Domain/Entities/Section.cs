using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class Section : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    public Guid? VolumeId { get; set; }

    [ForeignKey(nameof(VolumeId))]
    public Volume? Volume { get; set; }

    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string? Summary { get; set; }

    public string? Content { get; set; }

    public int Order { get; set; }

    [MaxLength(50)]
    public string Status { get; set; } = string.Empty;

    public string? Tags { get; set; }
}
