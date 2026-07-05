using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class VoiceProfile : BaseEntity
{
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    public string? Settings { get; set; }
}
