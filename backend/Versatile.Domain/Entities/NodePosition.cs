using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

// Local-only; not synced to server (canvas layout state)
public class NodePosition : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [MaxLength(100)]
    public string NodeId { get; set; } = string.Empty;

    [MaxLength(50)]
    public string NodeType { get; set; } = string.Empty;

    public double X { get; set; }

    public double Y { get; set; }
}
