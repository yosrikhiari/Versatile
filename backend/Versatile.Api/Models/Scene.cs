using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Api.Models;

[Table("scenes")]
public class Scene
{
    [Key]
    public Guid Id { get; set; }

    [Column("project_id")]
    public Guid ProjectId { get; set; }

    public Project Project { get; set; } = null!;

    [Column("chapter_id")]
    public Guid ChapterId { get; set; }

    public Chapter Chapter { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;

    [Column("order")]
    public int Order { get; set; }

    public string Content { get; set; } = string.Empty;

    public List<string> Tags { get; set; } = [];

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [Column("deleted_at")]
    public DateTime? DeletedAt { get; set; }
}
