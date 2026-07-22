using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

// Local-only; not synced to server
public class Snapshot : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    public Guid? ChapterId { get; set; }

    public DateTime Timestamp { get; set; }

    [MaxLength(200)]
    public string? Label { get; set; }

    public string? Data { get; set; }
}
