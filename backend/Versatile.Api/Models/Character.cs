using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Api.Models;

[Table("characters")]
public class Character
{
    [Key]
    public Guid Id { get; set; }

    [Column("project_id")]
    public Guid ProjectId { get; set; }

    public Project Project { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Goal { get; set; } = string.Empty;
    public string Voice { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public string Color { get; set; } = "#6366f1";
    public string Portrait { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [Column("deleted_at")]
    public DateTime? DeletedAt { get; set; }
}
