using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Branches.Handlers;

internal static class BranchMapping
{
    public static BranchDto ToDto(Branch b) =>
        new(b.Id, b.StoryId, b.SourceBranchId, b.Name, b.Description, b.Status, b.CreatedAt, b.UpdatedAt);

    /// <summary>The caller's own branch, or <see cref="KeyNotFoundException"/>.</summary>
    public static async Task<Branch> OwnedAsync(IRepository<Branch> repo, Guid id, Guid userId, Guid? orgId, CancellationToken ct)
    {
        var rows = await repo.GetAllAsync(b => b.Id == id && b.UserId == userId && b.OrganizationId == orgId, ct);
        return rows.FirstOrDefault() ?? throw new KeyNotFoundException("Branch not found");
    }

    /// <summary>
    /// A fork's source must be another branch of the same story. Null and
    /// <see cref="Guid.Empty"/> both mean "no source" (the main line).
    /// </summary>
    public static async Task<Guid?> SourceInStoryAsync(IRepository<Branch> repo, Guid? sourceId, Guid storyId, Guid? selfId, CancellationToken ct)
    {
        if (sourceId is not Guid id || id == Guid.Empty) return null;
        if (id == selfId) throw new KeyNotFoundException("Source branch not found");
        var source = await repo.GetByIdAsync(id, ct);
        if (source is null || source.StoryId != storyId) throw new KeyNotFoundException("Source branch not found");
        return id;
    }
}
