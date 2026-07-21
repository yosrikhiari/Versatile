using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Data;

public class ApplicationDbContext : DbContext
{
    private readonly IOrganizationContext _orgContext;
    private readonly Guid? _tenantId;

    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options, IOrganizationContext orgContext) : base(options)
    {
        _orgContext = orgContext;
        _tenantId = orgContext.OrganizationId;
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<OrganizationMembership> OrganizationMemberships => Set<OrganizationMembership>();
    public DbSet<Story> Stories => Set<Story>();
    public DbSet<Chapter> Chapters => Set<Chapter>();
    public DbSet<Scene> Scenes => Set<Scene>();
    public DbSet<Entity> Entities => Set<Entity>();
    public DbSet<Flow> Flows => Set<Flow>();
    public DbSet<Research> ResearchNotes => Set<Research>();
    public DbSet<BibleEntry> BibleEntries => Set<BibleEntry>();
    public DbSet<Annotation> Annotations => Set<Annotation>();
    public DbSet<AuthorProfile> AuthorProfiles => Set<AuthorProfile>();
    public DbSet<CharacterRelationship> CharacterRelationships => Set<CharacterRelationship>();
    public DbSet<DailyGoal> DailyGoals => Set<DailyGoal>();
    public DbSet<GeneratedStory> GeneratedStories => Set<GeneratedStory>();
    public DbSet<GraphEdge> GraphEdges => Set<GraphEdge>();
    public DbSet<GraphGroup> GraphGroups => Set<GraphGroup>();
    public DbSet<GroupEdge> GroupEdges => Set<GroupEdge>();
    public DbSet<Manuscript> Manuscripts => Set<Manuscript>();
    public DbSet<NodePosition> NodePositions => Set<NodePosition>();
    public DbSet<PlotThread> PlotThreads => Set<PlotThread>();
    public DbSet<ResearchChunk> ResearchChunks => Set<ResearchChunk>();
    public DbSet<ResearchDocument> ResearchDocuments => Set<ResearchDocument>();
    public DbSet<ResearchTag> ResearchTags => Set<ResearchTag>();
    public DbSet<RevisionComment> RevisionComments => Set<RevisionComment>();
    public DbSet<Section> Sections => Set<Section>();
    public DbSet<SessionArchiveItem> SessionArchiveItems => Set<SessionArchiveItem>();
    public DbSet<Snapshot> Snapshots => Set<Snapshot>();
    public DbSet<Snippet> Snippets => Set<Snippet>();
    public DbSet<SparkHistoryItem> SparkHistoryItems => Set<SparkHistoryItem>();
    public DbSet<StoryDocument> StoryDocuments => Set<StoryDocument>();
    public DbSet<StoryElement> StoryElements => Set<StoryElement>();
    public DbSet<StoryStateSnapshot> StoryStateSnapshots => Set<StoryStateSnapshot>();
    public DbSet<Subsection> Subsections => Set<Subsection>();
    public DbSet<VoiceProfile> VoiceProfiles => Set<VoiceProfile>();
    public DbSet<Volume> Volumes => Set<Volume>();
    public DbSet<VolumeEntity> VolumeEntities => Set<VolumeEntity>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();
    public DbSet<AuditEntry> AuditLog => Set<AuditEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Organization>(e =>
        {
            e.HasIndex(o => o.Slug).IsUnique();
        });

        modelBuilder.Entity<OrganizationMembership>(e =>
        {
            e.HasKey(m => new { m.OrganizationId, m.UserId });
            e.HasOne(m => m.Organization).WithMany(o => o.Memberships).HasForeignKey(m => m.OrganizationId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(m => m.User).WithMany(u => u.OrganizationMemberships).HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Username).IsUnique();
            e.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<Story>(e =>
        {
            e.HasIndex(s => s.UserId);
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Chapter>(e =>
        {
            e.HasIndex(c => c.StoryId);
            e.HasOne(c => c.Story).WithMany(s => s.Chapters).HasForeignKey(c => c.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Scene>(e =>
        {
            e.HasIndex(s => s.ChapterId);
            e.HasOne(s => s.Chapter).WithMany(c => c.Scenes).HasForeignKey(s => s.ChapterId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Entity>(e =>
        {
            e.HasIndex(ent => ent.StoryId);
            e.HasOne(ent => ent.Story).WithMany(s => s.Entities).HasForeignKey(ent => ent.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Flow>(e =>
        {
            e.HasIndex(f => f.StoryId).IsUnique();
            e.HasOne(f => f.Story).WithMany().HasForeignKey(f => f.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Research>(e =>
        {
            e.HasIndex(r => r.StoryId);
            e.HasOne(r => r.Story).WithMany(s => s.ResearchNotes).HasForeignKey(r => r.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BibleEntry>(e =>
        {
            e.HasIndex(b => b.StoryId);
            e.HasOne(b => b.Story).WithMany(s => s.BibleEntries).HasForeignKey(b => b.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Annotation>(e =>
        {
            e.HasIndex(a => a.StoryId);
            e.HasOne(a => a.Story).WithMany(s => s.Annotations).HasForeignKey(a => a.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuthorProfile>(e =>
        {
            e.HasIndex(a => a.StoryId);
            e.HasOne(a => a.Story).WithMany(s => s.AuthorProfiles).HasForeignKey(a => a.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CharacterRelationship>(e =>
        {
            e.HasIndex(c => c.StoryId);
            e.HasOne(c => c.Story).WithMany(s => s.CharacterRelationships).HasForeignKey(c => c.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DailyGoal>(e =>
        {
            e.HasIndex(d => d.StoryId);
            e.HasOne(d => d.Story).WithMany(s => s.DailyGoals).HasForeignKey(d => d.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GeneratedStory>(e =>
        {
            e.HasIndex(g => g.StoryId);
            e.HasOne(g => g.Story).WithMany(s => s.GeneratedStories).HasForeignKey(g => g.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GraphEdge>(e =>
        {
            e.HasIndex(g => g.StoryId);
            e.HasOne(g => g.Story).WithMany(s => s.GraphEdges).HasForeignKey(g => g.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GraphGroup>(e =>
        {
            e.HasIndex(g => g.StoryId);
            e.HasOne(g => g.Story).WithMany(s => s.GraphGroups).HasForeignKey(g => g.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GroupEdge>(e =>
        {
            e.HasIndex(g => g.StoryId);
            e.HasOne(g => g.Story).WithMany(s => s.GroupEdges).HasForeignKey(g => g.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Manuscript>(e =>
        {
            e.HasIndex(m => m.StoryId);
            e.HasOne(m => m.Story).WithMany(s => s.Manuscripts).HasForeignKey(m => m.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<NodePosition>(e =>
        {
            e.HasIndex(n => n.StoryId);
            e.HasOne(n => n.Story).WithMany(s => s.NodePositions).HasForeignKey(n => n.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PlotThread>(e =>
        {
            e.HasIndex(p => p.StoryId);
            e.HasOne(p => p.Story).WithMany(s => s.PlotThreads).HasForeignKey(p => p.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ResearchDocument>(e =>
        {
            e.HasIndex(r => r.StoryId);
            e.HasOne(r => r.Story).WithMany(s => s.ResearchDocuments).HasForeignKey(r => r.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ResearchChunk>(e =>
        {
            e.HasIndex(r => r.StoryId);
            e.HasIndex(r => r.DocumentId);
            e.HasOne(r => r.Story).WithMany(s => s.ResearchChunks).HasForeignKey(r => r.StoryId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(r => r.ResearchDocument).WithMany().HasForeignKey(r => r.DocumentId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ResearchTag>(e =>
        {
            e.HasIndex(r => r.StoryId);
            e.HasOne(r => r.Story).WithMany(s => s.ResearchTags).HasForeignKey(r => r.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RevisionComment>(e =>
        {
            e.HasIndex(r => r.StoryId);
            e.HasOne(r => r.Story).WithMany(s => s.RevisionComments).HasForeignKey(r => r.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Section>(e =>
        {
            e.HasIndex(s => s.StoryId);
            e.HasIndex(s => s.VolumeId);
            e.HasOne(s => s.Story).WithMany(st => st.Sections).HasForeignKey(s => s.StoryId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(s => s.Volume).WithMany().HasForeignKey(s => s.VolumeId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<SessionArchiveItem>(e =>
        {
            e.HasIndex(s => s.StoryId);
            e.HasOne(s => s.Story).WithMany(st => st.SessionArchiveItems).HasForeignKey(s => s.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Snapshot>(e =>
        {
            e.HasIndex(s => s.StoryId);
            e.HasOne(s => s.Story).WithMany(st => st.Snapshots).HasForeignKey(s => s.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Snippet>(e =>
        {
            e.HasIndex(s => s.StoryId);
            e.HasOne(s => s.Story).WithMany(st => st.Snippets).HasForeignKey(s => s.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SparkHistoryItem>(e =>
        {
            e.HasIndex(s => s.StoryId);
            e.HasOne(s => s.Story).WithMany(st => st.SparkHistoryItems).HasForeignKey(s => s.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<StoryDocument>(e =>
        {
            e.HasIndex(s => s.StoryId);
            e.HasOne(s => s.Story).WithMany(st => st.StoryDocuments).HasForeignKey(s => s.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<StoryElement>(e =>
        {
            e.HasIndex(s => s.StoryId);
            e.HasOne(s => s.Story).WithMany(st => st.StoryElements).HasForeignKey(s => s.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<StoryStateSnapshot>(e =>
        {
            e.HasIndex(s => s.StoryId);
            e.HasOne(s => s.Story).WithMany(st => st.StoryStateSnapshots).HasForeignKey(s => s.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Subsection>(e =>
        {
            e.HasIndex(s => s.StoryId);
            e.HasIndex(s => s.SectionId);
            e.HasOne(s => s.Story).WithMany(st => st.Subsections).HasForeignKey(s => s.StoryId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(s => s.Section).WithMany().HasForeignKey(s => s.SectionId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<VoiceProfile>(e =>
        {
            e.HasIndex(v => v.StoryId);
            e.HasOne(v => v.Story).WithMany(s => s.VoiceProfiles).HasForeignKey(v => v.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Volume>(e =>
        {
            e.HasIndex(v => v.StoryId);
            e.HasOne(v => v.Story).WithMany(s => s.Volumes).HasForeignKey(v => v.StoryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VolumeEntity>(e =>
        {
            e.HasIndex(v => v.StoryId);
            e.HasIndex(v => v.VolumeId);
            e.HasOne(v => v.Story).WithMany(s => s.VolumeEntities).HasForeignKey(v => v.StoryId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(v => v.Volume).WithMany().HasForeignKey(v => v.VolumeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AuditEntry>(e =>
        {
            e.ToTable("AuditLog");
            e.HasKey(a => a.Id);
            e.Property(a => a.Action).HasMaxLength(50).IsRequired();
            e.Property(a => a.EntityType).HasMaxLength(200).IsRequired();
            e.Property(a => a.EntityId).HasMaxLength(100).IsRequired();
            e.Property(a => a.CreatedAt).IsRequired();
            e.HasIndex(a => a.CreatedAt);
            e.HasIndex(a => a.EntityType);
            e.HasIndex(a => a.UserId);
            e.HasIndex(a => a.OrganizationId);
        });

        modelBuilder.Entity<OutboxMessage>(e =>
        {
            e.ToTable("OutboxMessages");
            e.HasKey(o => o.Id);
            e.Property(o => o.Type).HasMaxLength(500).IsRequired();
            e.Property(o => o.Content).IsRequired();
            e.Property(o => o.CreatedAt).IsRequired();
            e.HasIndex(o => new { o.ProcessedAt, o.RetryCount });
        });

        ApplyTenantFilter(modelBuilder);
    }

    private void ApplyTenantFilter(ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes()
            .Where(e => typeof(UserOwnedEntity).IsAssignableFrom(e.ClrType)))
        {
            modelBuilder.Entity(entityType.ClrType).HasIndex(nameof(UserOwnedEntity.OrganizationId));

            var param = Expression.Parameter(entityType.ClrType, "e");
            var orgIdProp = Expression.PropertyOrField(param, nameof(UserOwnedEntity.OrganizationId));
            var tenantField = Expression.Field(Expression.Constant(this), nameof(_tenantId));
            var nullConst = Expression.Constant(null, typeof(Guid?));

            var isNull = Expression.Equal(tenantField, nullConst);
            var match = Expression.Equal(orgIdProp, tenantField);
            var body = Expression.OrElse(isNull, match);

            modelBuilder.Entity(entityType.ClrType).HasQueryFilter(Expression.Lambda(body, param));
        }
    }
}
