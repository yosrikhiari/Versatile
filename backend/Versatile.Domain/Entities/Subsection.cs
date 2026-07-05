using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class Subsection : BaseEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [Required]
    public Guid SectionId { get; set; }

    [ForeignKey(nameof(SectionId))]
    public Section? Section { get; set; }

    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string? Summary { get; set; }

    public string? Content { get; set; }

    public int Order { get; set; }

    public string? Tags { get; set; }
}
