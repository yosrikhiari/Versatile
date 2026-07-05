using System.ComponentModel.DataAnnotations;

namespace Versatile.Domain.Entities;

public abstract class BaseEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public abstract class UserOwnedEntity : BaseEntity
{
    public Guid UserId { get; set; }
}
