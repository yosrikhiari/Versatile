using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Api.Models;

[Table("group_edges")]
public class GroupEdge
{
    [Key]
    public Guid Id { get; set; }

    [Column("project_id")]
    public Guid ProjectId { get; set; }

    public Project Project { get; set; } = null!;

    [Column("source_group_id")]
    public string SourceGroupId { get; set; } = string.Empty;

    [Column("target_group_id")]
    public string TargetGroupId { get; set; } = string.Empty;

    [Column("relationship_type")]
    public string RelationshipType { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("deleted_at")]
    public DateTime? DeletedAt { get; set; }
}
