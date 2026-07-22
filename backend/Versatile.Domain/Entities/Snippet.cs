using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

// Local-only; not synced to server
public class Snippet : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [MaxLength(200)]
    public string Word { get; set; } = string.Empty;

    public int Count { get; set; }

    public DateTime LastSeen { get; set; }
}
