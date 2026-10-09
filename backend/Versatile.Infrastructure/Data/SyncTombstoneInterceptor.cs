using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Data;

/// <summary>
/// Records a <see cref="SyncTombstone"/> for every deleted row of a synced
/// table, so other devices learn about remote deletes on pull. Central hook
/// (mirrors <see cref="AuditSaveChangesInterceptor"/>) — delete handlers stay
/// untouched. Skips infrastructure tables, non-synced tables, and rows whose
/// story cannot be determined. Prunes same-organization tombstones older than
/// 90 days when it writes (no job server exists to do it on a schedule).
/// </summary>
public sealed class SyncTombstoneInterceptor : SaveChangesInterceptor
{
    /// <summary>CLR type name → client sync table. Characters and locations
    /// share the server's Entities table and are told apart by discriminator.</summary>
    private static readonly Dictionary<string, string> SyncedTables = new()
    {
        ["Story"] = "projects",
        ["Branch"] = "branches",
        ["Volume"] = "volumes",
        ["PlotThread"] = "plotThreads",
        ["Section"] = "sections",
        ["Subsection"] = "subsections",
        ["CharacterRelationship"] = "characterRelationships",
        ["VolumeEntity"] = "volumeEntities",
        ["Manuscript"] = "manuscripts",
        ["ResearchDocument"] = "researchDocuments",
        ["ResearchChunk"] = "researchChunks",
        ["ResearchTag"] = "researchTags",
    };

    private static readonly TimeSpan TombstoneRetention = TimeSpan.FromDays(90);

    private readonly IOrganizationContext _orgContext;

    public SyncTombstoneInterceptor(IOrganizationContext orgContext)
    {
        _orgContext = orgContext;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        var context = eventData.Context;
        if (context is null)
            return await base.SavingChangesAsync(eventData, result, cancellationToken);

        var timestamp = DateTime.UtcNow;
        var tombstones = new List<SyncTombstone>();

        foreach (var entry in context.ChangeTracker.Entries())
        {
            if (entry.State != EntityState.Deleted)
                continue;
            if (entry.Entity is AuditEntry || entry.Entity is OutboxMessage || entry.Entity is SyncTombstone)
                continue;

            var clrName = entry.Entity.GetType().Name;
            string? table;
            if (clrName == nameof(Entity))
            {
                // Characters and locations share one table; only synced
                // discriminator values produce tombstones.
                var type = entry.Property("Type").OriginalValue as string;
                table = type == "Character" ? "characters"
                    : type == "Location" ? "locations"
                    : null;
            }
            else if (!SyncedTables.TryGetValue(clrName, out table))
            {
                continue;
            }
            if (table is null)
            {
                // Entity rows with a non-synced discriminator value.
                continue;
            }

            Guid storyId;
            if (entry.Entity is Story story)
            {
                storyId = story.Id;
            }
            else
            {
                var storyProp = entry.Properties.FirstOrDefault(p => p.Metadata.Name == "StoryId");
                if (storyProp?.OriginalValue is not Guid id || id == Guid.Empty)
                    continue;
                storyId = id;
            }

            var key = entry.Metadata.FindPrimaryKey();
            var rowId = key?.Properties
                .Select(p => entry.Property(p.Name).OriginalValue)
                .OfType<Guid>()
                .FirstOrDefault() ?? Guid.Empty;
            if (rowId == Guid.Empty)
                continue;

            tombstones.Add(new SyncTombstone
            {
                Id = Guid.NewGuid(),
                // The deleter is not tracked here (no HttpContext dependency for
                // a field nothing reads); tenancy rides on OrganizationId.
                UserId = Guid.Empty,
                OrganizationId = _orgContext.OrganizationId,
                StoryId = storyId,
                Table = table,
                RowId = rowId,
                DeletedAt = timestamp,
                CreatedAt = timestamp,
                UpdatedAt = timestamp,
            });
        }

        if (tombstones.Count > 0)
        {
            context.Set<SyncTombstone>().AddRange(tombstones);
            // Set-based prune needs a relational provider; the in-memory
            // database used in tests has no tombstone volume worth pruning.
            if (context.Database.IsRelational())
            {
                var cutoff = timestamp - TombstoneRetention;
                var orgId = _orgContext.OrganizationId;
                await context.Set<SyncTombstone>()
                    .Where(t => t.OrganizationId == orgId && t.DeletedAt < cutoff)
                    .ExecuteDeleteAsync(cancellationToken);
            }
        }

        return await base.SavingChangesAsync(eventData, result, cancellationToken);
    }
}
