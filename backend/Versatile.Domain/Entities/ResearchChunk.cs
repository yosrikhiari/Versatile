using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class ResearchChunk
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid DocumentId { get; set; }

    [ForeignKey(nameof(DocumentId))]
    public ResearchDocument? ResearchDocument { get; set; }

    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    public int ChunkIndex { get; set; }

    public string? Content { get; set; }

    public string? Embedding { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
