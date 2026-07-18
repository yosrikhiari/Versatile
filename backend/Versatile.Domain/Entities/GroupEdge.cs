using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class GroupEdge : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [MaxLength(100)]
    public string SourceGroupId { get; set; } = string.Empty;

    [MaxLength(100)]
    public string TargetGroupId { get; set; } = string.Empty;

    [MaxLength(50)]
    public string RelationshipType { get; set; } = string.Empty;
}
