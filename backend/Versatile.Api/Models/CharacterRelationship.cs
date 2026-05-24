using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Api.Models;

[Table("character_relationships")]
public class CharacterRelationship
{
    [Key]
    public Guid Id { get; set; }

    [Column("project_id")]
    public Guid ProjectId { get; set; }

    public Project Project { get; set; } = null!;

    [Column("from_character_id")]
    public Guid FromCharacterId { get; set; }

    [Column("to_character_id")]
    public Guid ToCharacterId { get; set; }

    public string Type { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
