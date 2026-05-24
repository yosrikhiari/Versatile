using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Api.Models;

[Table("chapters")]
public class Chapter
{
    [Key]
    public Guid Id { get; set; }

    [Column("project_id")]
    public Guid ProjectId { get; set; }

    public Project Project { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;

    [Column("order")]
    public int Order { get; set; }

    public string Status { get; set; } = "planning";

    public List<string> Tags { get; set; } = [];

    [Column("volume_id")]
    public Guid? VolumeId { get; set; }

    public Volume? Volume { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [Column("deleted_at")]
    public DateTime? DeletedAt { get; set; }

    public ICollection<Scene> Scenes { get; set; } = [];
}
