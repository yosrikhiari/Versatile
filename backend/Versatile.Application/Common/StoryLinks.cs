using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Common;

/// <summary>
/// Resolves an optional link from a chapter or scene to a volume or branch.
/// The id must name a row of the same story: without the check a caller could
/// attach a chapter to another story's (or another user's) volume.
/// Null and <see cref="Guid.Empty"/> both mean "no link".
/// </summary>
public static class StoryLinks
{
    public static async Task<Guid?> VolumeInStory(IRepository<Versatile.Domain.Entities.Volume> repo, Guid? volumeId, Guid storyId, CancellationToken ct)
    {
        if (volumeId is not Guid id || id == Guid.Empty) return null;
        var volume = await repo.GetByIdAsync(id, ct);
        if (volume is null || volume.StoryId != storyId) throw new KeyNotFoundException("Volume not found");
        return id;
    }

    public static async Task<Guid?> BranchInStory(IRepository<Branch> repo, Guid? branchId, Guid storyId, CancellationToken ct)
    {
        if (branchId is not Guid id || id == Guid.Empty) return null;
        var branch = await repo.GetByIdAsync(id, ct);
        if (branch is null || branch.StoryId != storyId) throw new KeyNotFoundException("Branch not found");
        return id;
    }
}
