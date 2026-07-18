using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class DailyGoal : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    [ForeignKey(nameof(StoryId))]
    public Story? Story { get; set; }

    public DateTime Date { get; set; }

    public int TargetWords { get; set; }

    public int CurrentWords { get; set; }

    public bool Completed { get; set; }
}
