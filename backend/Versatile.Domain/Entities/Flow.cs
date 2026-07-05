using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class Flow
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [Required]
    public string Nodes { get; set; } = "[]";

    [Required]
    public string Edges { get; set; } = "[]";

    public string? Viewport { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
