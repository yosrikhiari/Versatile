using System.ComponentModel.DataAnnotations;

namespace Versatile.Domain.Entities;

public class Organization : BaseEntity
{
    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string Slug { get; set; } = string.Empty;

    public ICollection<OrganizationMembership> Memberships { get; set; } = new List<OrganizationMembership>();
}
