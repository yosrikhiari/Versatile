using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class StoryElement : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [MaxLength(100)]
    public string Type { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public double X { get; set; }

    public double Y { get; set; }

    public double Width { get; set; }

    public double Height { get; set; }

    public string? Data { get; set; }
}
