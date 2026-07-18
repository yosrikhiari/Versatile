using System.ComponentModel.DataAnnotations.Schema;
using Versatile.Domain.Enums;

namespace Versatile.Domain.Entities;

public class OrganizationMembership
{
    public Guid OrganizationId { get; set; }
    public Guid UserId { get; set; }
    public OrganizationRole Role { get; set; } = OrganizationRole.Member;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(OrganizationId))]
    public Organization? Organization { get; set; }

    [ForeignKey(nameof(UserId))]
    public User? User { get; set; }
}
