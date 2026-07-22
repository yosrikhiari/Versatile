using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

// Local-only; not synced to server (superseded by Section)
public class Chapter : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public int Order { get; set; }

    [MaxLength(50)]
    public string Status { get; set; } = "draft";

    [MaxLength(200)]
    public string? ArcAssignment { get; set; }

    public ICollection<Scene> Scenes { get; set; } = new List<Scene>();
}
