using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class RevisionComment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    public int ParagraphIndex { get; set; }

    public int StartOffset { get; set; }

    public int EndOffset { get; set; }

    public string? SelectedText { get; set; }

    public string? Comment { get; set; }

    public bool Resolved { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
