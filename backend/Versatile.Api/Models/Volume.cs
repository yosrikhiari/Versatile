using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Api.Models;

[Table("volumes")]
public class Volume
{
    [Key]
    public Guid Id { get; set; }

    [Column("project_id")]
    public Guid ProjectId { get; set; }

    public Project Project { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Color { get; set; } = "#6366f1";

    [Column("chapter_ids", TypeName = "uuid[]")]
    public List<Guid> ChapterIds { get; set; } = [];

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [Column("deleted_at")]
    public DateTime? DeletedAt { get; set; }

    public ICollection<Section> Sections { get; set; } = [];
    public ICollection<Chapter> Chapters { get; set; } = [];
    public ICollection<VolumeEntity> VolumeEntities { get; set; } = [];
}
