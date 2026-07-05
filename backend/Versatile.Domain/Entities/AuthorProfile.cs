using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class AuthorProfile : BaseEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    [MaxLength(200)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(200)]
    public string PenName { get; set; } = string.Empty;

    public string? Bio { get; set; }

    public string? Settings { get; set; }
}
