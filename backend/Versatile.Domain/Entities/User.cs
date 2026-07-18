using System.ComponentModel.DataAnnotations;

namespace Versatile.Domain.Entities;

public class User : BaseEntity
{
    [Required, MaxLength(100)]
    public string Username { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? Email { get; set; }

    [MaxLength(100)]
    public string? DisplayName { get; set; }

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiresAt { get; set; }

    public string? ApiKeysEncrypted { get; set; }
    public string? ApiKeysNonce { get; set; }

    public string? Preferences { get; set; }

    public ICollection<OrganizationMembership> OrganizationMemberships { get; set; } = new List<OrganizationMembership>();
}
