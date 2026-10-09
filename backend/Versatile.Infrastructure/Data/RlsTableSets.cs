namespace Versatile.Infrastructure.Data;

/// <summary>
/// The single source of truth for which tables carry the tenant-isolation
/// RLS policy and FORCE ROW LEVEL SECURITY.
///
/// History: <c>AddRowLevelSecurity</c> enabled RLS on 34 tables. That set is
/// stale — it includes <c>ResearchNotes</c> (dropped by
/// <c>RemoveResearchNotes</c>) and omits <c>Stories</c> and <c>Branches</c>,
/// both <see cref="Versatile.Domain.Entities.UserOwnedEntity"/> tables that
/// were unprotected at the database level. New migrations and the
/// <c>RlsCoverageTests</c> suite both read this set so the next entity added
/// without a policy fails a test instead of shipping silently.
///
/// Identity-only tables (<c>Users</c>, <c>Organizations</c>,
/// <c>OrganizationMemberships</c>) and infrastructure tables
/// (<c>AuditLog</c>, <c>OutboxMessages</c>) are deliberately excluded, matching
/// <see cref="ApplicationDbContext.EnsureTenantSafety"/>.
/// </summary>
public static class RlsTableSets
{
    public const string AppRole = "versatile_app";

    public const string PolicyName = "tenant_isolation";

    /// <summary>
    /// Quoted table names that must carry the tenant policy with FORCE RLS.
    /// </summary>
    public static readonly string[] ForcedTables =
    [
        "Annotations",
        "AuthorProfiles",
        "BibleEntries",
        "Branches",
        "Chapters",
        "CharacterRelationships",
        "DailyGoals",
        "Entities",
        "Flows",
        "GeneratedStories",
        "GraphEdges",
        "GraphGroups",
        "GroupEdges",
        "Manuscripts",
        "NodePositions",
        "PlotThreads",
        "ResearchChunks",
        "ResearchDocuments",
        "ResearchTags",
        "RevisionComments",
        "Scenes",
        "Sections",
        "SessionArchiveItems",
        "Snapshots",
        "Snippets",
        "SparkHistoryItems",
        "Stories",
        "StoryDocuments",
        "StoryElements",
        "StoryStateSnapshots",
        "Subsections",
        "SyncTombstones",
        "VoiceProfiles",
        "VolumeEntities",
        "Volumes",
    ];
}
