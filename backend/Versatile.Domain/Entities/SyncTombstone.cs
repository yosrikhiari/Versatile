using System.ComponentModel.DataAnnotations;

namespace Versatile.Domain.Entities;

/// <summary>
/// Server-side record that a synced row was deleted on some device, so other
/// devices can delete their local copy on pull. Written by
/// <see cref="Versatile.Infrastructure.Data.SyncTombstoneInterceptor"/> for
/// every deleted row of a synced table — one central hook instead of edits in
/// each of the 30+ delete handlers. Never synced to clients as a table; clients
/// read tombstones through <c>GET /api/story/{storyId}/sync-tombstones</c> and
/// apply them to clean rows only (locally dirty rows win, as elsewhere).
/// Tombstones older than 90 days are pruned when new ones are written (there
/// is no background-job server); a device offline longer than that misses the
/// delete, a documented limitation.
/// </summary>
public class SyncTombstone : UserOwnedEntity
{
    [Required]
    public Guid StoryId { get; set; }

    /// <summary>Client sync vocabulary name (e.g. "sections", "characters").</summary>
    [Required, MaxLength(100)]
    public string Table { get; set; } = string.Empty;

    /// <summary>Server id of the deleted row (what the client calls apiId).</summary>
    [Required]
    public Guid RowId { get; set; }

    public DateTime DeletedAt { get; set; } = DateTime.UtcNow;
}
