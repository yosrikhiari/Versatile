using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Api.Models;

[Table("graph_edges")]
public class GraphEdge
{
    [Key]
    public Guid Id { get; set; }

    [Column("project_id")]
    public Guid ProjectId { get; set; }

    public Project Project { get; set; } = null!;

    [Column("source_id")]
    public Guid SourceId { get; set; }

    [Column("source_type")]
    public string SourceType { get; set; } = string.Empty;

    [Column("target_id")]
    public Guid TargetId { get; set; }

    [Column("target_type")]
    public string TargetType { get; set; } = string.Empty;

    [Column("relationship_type")]
    public string RelationshipType { get; set; } = string.Empty;

    [Column("volume_id")]
    public Guid? VolumeId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [Column("deleted_at")]
    public DateTime? DeletedAt { get; set; }
}
