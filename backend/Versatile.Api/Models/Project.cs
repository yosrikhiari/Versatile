using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Api.Models;

[Table("projects")]
public class Project
{
    [Key]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public string Genre { get; set; } = string.Empty;
    public string Synopsis { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [Column("deleted_at")]
    public DateTime? DeletedAt { get; set; }

    public Manuscript? Manuscript { get; set; }
    public ICollection<Character> Characters { get; set; } = [];
    public ICollection<CharacterRelationship> CharacterRelationships { get; set; } = [];
    public ICollection<Location> Locations { get; set; } = [];
    public ICollection<PlotThread> PlotThreads { get; set; } = [];
    public ICollection<Section> Sections { get; set; } = [];
    public ICollection<Subsection> Subsections { get; set; } = [];
    public ICollection<Chapter> Chapters { get; set; } = [];
    public ICollection<Scene> Scenes { get; set; } = [];
    public ICollection<SparkHistory> SparkHistories { get; set; } = [];
    public ICollection<Annotation> Annotations { get; set; } = [];
    public ICollection<Snippet> Snippets { get; set; } = [];
    public ICollection<DailyGoal> DailyGoals { get; set; } = [];
    public ICollection<RevisionComment> RevisionComments { get; set; } = [];
    public ICollection<StoryElement> StoryElements { get; set; } = [];
    public ICollection<GraphEdge> GraphEdges { get; set; } = [];
    public ICollection<GraphGroup> GraphGroups { get; set; } = [];
    public ICollection<NodePosition> NodePositions { get; set; } = [];
    public ICollection<GroupEdge> GroupEdges { get; set; } = [];
    public ICollection<Snapshot> Snapshots { get; set; } = [];
    public ICollection<Volume> Volumes { get; set; } = [];
}
