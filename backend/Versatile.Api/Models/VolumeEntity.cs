using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Api.Models;

[Table("volume_entities")]
public class VolumeEntity
{
    [Key]
    public Guid Id { get; set; }

    [Column("volume_id")]
    public Guid VolumeId { get; set; }

    public Volume Volume { get; set; } = null!;

    [Column("entity_type")]
    public string EntityType { get; set; } = string.Empty;

    [Column("entity_id")]
    public Guid EntityId { get; set; }

    [Column("is_primary")]
    public bool IsPrimary { get; set; }

    [Column("assigned_at")]
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
}
