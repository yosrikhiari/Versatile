using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class GraphEdge
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [MaxLength(100)]
    public string SourceId { get; set; } = string.Empty;

    [MaxLength(100)]
    public string TargetId { get; set; } = string.Empty;

    [MaxLength(50)]
    public string SourceType { get; set; } = string.Empty;

    [MaxLength(50)]
    public string TargetType { get; set; } = string.Empty;

    [MaxLength(50)]
    public string RelationshipType { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Label { get; set; }

    public Guid? VolumeId { get; set; }
}
