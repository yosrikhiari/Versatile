using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class Scene : BaseEntity
{
    [Required]
    public Guid ChapterId { get; set; }

    [ForeignKey(nameof(ChapterId))]
    public Chapter? Chapter { get; set; }

    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Status { get; set; } = "draft";

    public int WordCount { get; set; }
    public int Order { get; set; }
}
