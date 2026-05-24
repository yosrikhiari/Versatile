using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Api.Models;

[Table("graph_groups")]
public class GraphGroup
{
    [Key]
    public Guid Id { get; set; }

    [Column("project_id")]
    public Guid ProjectId { get; set; }

    public Project Project { get; set; } = null!;

    [Column(TypeName = "jsonb")]
    public string Groups { get; set; } = "[]";

    [Column("node_parents", TypeName = "jsonb")]
    public string NodeParents { get; set; } = "{}";

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
