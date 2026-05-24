using Microsoft.EntityFrameworkCore;
using Versatile.Api.Models;

namespace Versatile.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Manuscript> Manuscripts => Set<Manuscript>();
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<CharacterRelationship> CharacterRelationships => Set<CharacterRelationship>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<PlotThread> PlotThreads => Set<PlotThread>();
    public DbSet<Section> Sections => Set<Section>();
    public DbSet<Subsection> Subsections => Set<Subsection>();
    public DbSet<Chapter> Chapters => Set<Chapter>();
    public DbSet<Scene> Scenes => Set<Scene>();
    public DbSet<SparkHistory> SparkHistories => Set<SparkHistory>();
    public DbSet<Annotation> Annotations => Set<Annotation>();
    public DbSet<Snippet> Snippets => Set<Snippet>();
    public DbSet<DailyGoal> DailyGoals => Set<DailyGoal>();
    public DbSet<RevisionComment> RevisionComments => Set<RevisionComment>();
    public DbSet<StoryElement> StoryElements => Set<StoryElement>();
    public DbSet<GraphEdge> GraphEdges => Set<GraphEdge>();
    public DbSet<GraphGroup> GraphGroups => Set<GraphGroup>();
    public DbSet<NodePosition> NodePositions => Set<NodePosition>();
    public DbSet<GroupEdge> GroupEdges => Set<GroupEdge>();
    public DbSet<Snapshot> Snapshots => Set<Snapshot>();
    public DbSet<Volume> Volumes => Set<Volume>();
    public DbSet<VolumeEntity> VolumeEntities => Set<VolumeEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<Project>(e =>
        {
            e.HasIndex(p => p.UserId);
            e.HasQueryFilter(p => p.DeletedAt == null);
            e.HasOne(p => p.User).WithMany(u => u.Projects).HasForeignKey(p => p.UserId);
        });

        modelBuilder.Entity<Manuscript>(e =>
        {
            e.HasIndex(m => m.ProjectId);
            e.HasOne(m => m.Project).WithOne(p => p.Manuscript).HasForeignKey<Manuscript>(m => m.ProjectId);
        });

        modelBuilder.Entity<Character>(e =>
        {
            e.HasIndex(c => c.ProjectId);
            e.HasQueryFilter(c => c.DeletedAt == null);
            e.HasOne(c => c.Project).WithMany(p => p.Characters).HasForeignKey(c => c.ProjectId);
        });

        modelBuilder.Entity<CharacterRelationship>(e =>
        {
            e.HasIndex(r => r.ProjectId);
            e.HasOne(r => r.Project).WithMany(p => p.CharacterRelationships).HasForeignKey(r => r.ProjectId);
        });

        modelBuilder.Entity<Location>(e =>
        {
            e.HasIndex(l => l.ProjectId);
            e.HasQueryFilter(l => l.DeletedAt == null);
            e.HasOne(l => l.Project).WithMany(p => p.Locations).HasForeignKey(l => l.ProjectId);
        });

        modelBuilder.Entity<PlotThread>(e =>
        {
            e.HasIndex(p => p.ProjectId);
            e.HasQueryFilter(p => p.DeletedAt == null);
            e.HasOne(p => p.Project).WithMany(p => p.PlotThreads).HasForeignKey(p => p.ProjectId);
        });

        modelBuilder.Entity<Section>(e =>
        {
            e.HasIndex(s => s.ProjectId);
            e.HasQueryFilter(s => s.DeletedAt == null);
            e.HasOne(s => s.Project).WithMany(p => p.Sections).HasForeignKey(s => s.ProjectId);
            e.HasOne(s => s.Volume).WithMany(v => v.Sections).HasForeignKey(s => s.VolumeId).IsRequired(false);
            e.Property(s => s.Tags).HasColumnType("text[]");
        });

        modelBuilder.Entity<Subsection>(e =>
        {
            e.HasIndex(s => s.ProjectId);
            e.HasIndex(s => s.SectionId);
            e.HasQueryFilter(s => s.DeletedAt == null);
            e.HasOne(s => s.Project).WithMany(p => p.Subsections).HasForeignKey(s => s.ProjectId);
            e.HasOne(s => s.Section).WithMany(s => s.Subsections).HasForeignKey(s => s.SectionId);
            e.Property(s => s.Tags).HasColumnType("text[]");
        });

        modelBuilder.Entity<Chapter>(e =>
        {
            e.HasIndex(c => c.ProjectId);
            e.HasQueryFilter(c => c.DeletedAt == null);
            e.HasOne(c => c.Project).WithMany(p => p.Chapters).HasForeignKey(c => c.ProjectId);
            e.HasOne(c => c.Volume).WithMany(v => v.Chapters).HasForeignKey(c => c.VolumeId).IsRequired(false);
            e.Property(c => c.Tags).HasColumnType("text[]");
        });

        modelBuilder.Entity<Scene>(e =>
        {
            e.HasIndex(s => s.ProjectId);
            e.HasIndex(s => s.ChapterId);
            e.HasQueryFilter(s => s.DeletedAt == null);
            e.HasOne(s => s.Project).WithMany(p => p.Scenes).HasForeignKey(s => s.ProjectId);
            e.HasOne(s => s.Chapter).WithMany(c => c.Scenes).HasForeignKey(s => s.ChapterId);
            e.Property(s => s.Tags).HasColumnType("text[]");
        });

        modelBuilder.Entity<SparkHistory>(e =>
        {
            e.HasIndex(s => s.ProjectId);
            e.HasQueryFilter(s => s.DeletedAt == null);
            e.HasOne(s => s.Project).WithMany(p => p.SparkHistories).HasForeignKey(s => s.ProjectId);
        });

        modelBuilder.Entity<Annotation>(e =>
        {
            e.HasIndex(a => a.ProjectId);
            e.HasQueryFilter(a => a.DeletedAt == null);
            e.HasOne(a => a.Project).WithMany(p => p.Annotations).HasForeignKey(a => a.ProjectId);
        });

        modelBuilder.Entity<Snippet>(e =>
        {
            e.HasIndex(s => s.ProjectId);
            e.HasQueryFilter(s => s.DeletedAt == null);
            e.HasOne(s => s.Project).WithMany(p => p.Snippets).HasForeignKey(s => s.ProjectId);
        });

        modelBuilder.Entity<DailyGoal>(e =>
        {
            e.HasIndex(d => d.ProjectId);
            e.HasIndex(d => new { d.ProjectId, d.Date }).IsUnique();
            e.HasOne(d => d.Project).WithMany(p => p.DailyGoals).HasForeignKey(d => d.ProjectId);
        });

        modelBuilder.Entity<RevisionComment>(e =>
        {
            e.HasIndex(r => r.ProjectId);
            e.HasQueryFilter(r => r.DeletedAt == null);
            e.HasOne(r => r.Project).WithMany(p => p.RevisionComments).HasForeignKey(r => r.ProjectId);
        });

        modelBuilder.Entity<StoryElement>(e =>
        {
            e.HasIndex(s => s.ProjectId);
            e.HasQueryFilter(s => s.DeletedAt == null);
            e.HasOne(s => s.Project).WithMany(p => p.StoryElements).HasForeignKey(s => s.ProjectId);
        });

        modelBuilder.Entity<GraphEdge>(e =>
        {
            e.HasIndex(g => g.ProjectId);
            e.HasQueryFilter(g => g.DeletedAt == null);
            e.HasOne(g => g.Project).WithMany(p => p.GraphEdges).HasForeignKey(g => g.ProjectId);
        });

        modelBuilder.Entity<GraphGroup>(e =>
        {
            e.HasIndex(g => g.ProjectId);
            e.HasOne(g => g.Project).WithMany(p => p.GraphGroups).HasForeignKey(g => g.ProjectId);
        });

        modelBuilder.Entity<NodePosition>(e =>
        {
            e.HasIndex(n => n.ProjectId);
            e.HasOne(n => n.Project).WithMany(p => p.NodePositions).HasForeignKey(n => n.ProjectId);
        });

        modelBuilder.Entity<GroupEdge>(e =>
        {
            e.HasIndex(g => g.ProjectId);
            e.HasQueryFilter(g => g.DeletedAt == null);
            e.HasOne(g => g.Project).WithMany(p => p.GroupEdges).HasForeignKey(g => g.ProjectId);
        });

        modelBuilder.Entity<Snapshot>(e =>
        {
            e.HasIndex(s => s.ProjectId);
            e.HasQueryFilter(s => s.DeletedAt == null);
            e.HasOne(s => s.Project).WithMany(p => p.Snapshots).HasForeignKey(s => s.ProjectId);
        });

        modelBuilder.Entity<Volume>(e =>
        {
            e.HasIndex(v => v.ProjectId);
            e.HasQueryFilter(v => v.DeletedAt == null);
            e.HasOne(v => v.Project).WithMany(p => p.Volumes).HasForeignKey(v => v.ProjectId);
            e.Property(v => v.ChapterIds).HasColumnType("uuid[]");
        });

        modelBuilder.Entity<VolumeEntity>(e =>
        {
            e.HasIndex(v => v.VolumeId);
            e.HasIndex(v => new { v.VolumeId, v.EntityType, v.EntityId }).IsUnique();
            e.HasOne(v => v.Volume).WithMany(v => v.VolumeEntities).HasForeignKey(v => v.VolumeId);
        });
    }
}
