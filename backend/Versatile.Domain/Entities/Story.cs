using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Versatile.Domain.Entities;

public class Story : UserOwnedEntity
{
    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string? Premise { get; set; }

    [MaxLength(100)]
    public string? Genre { get; set; }

    [MaxLength(100)]
    public string? Tone { get; set; }

    [MaxLength(100)]
    public string? WritingStyle { get; set; }

    [MaxLength(100)]
    public string? TargetAudience { get; set; }

    [ForeignKey(nameof(UserId))]
    public User? User { get; set; }

    public ICollection<Chapter> Chapters { get; set; } = new List<Chapter>();
    public ICollection<Entity> Entities { get; set; } = new List<Entity>();
    public ICollection<Research> ResearchNotes { get; set; } = new List<Research>();
    public ICollection<BibleEntry> BibleEntries { get; set; } = new List<BibleEntry>();
    public ICollection<Manuscript> Manuscripts { get; set; } = new List<Manuscript>();
    public ICollection<CharacterRelationship> CharacterRelationships { get; set; } = new List<CharacterRelationship>();
    public ICollection<PlotThread> PlotThreads { get; set; } = new List<PlotThread>();
    public ICollection<Section> Sections { get; set; } = new List<Section>();
    public ICollection<Subsection> Subsections { get; set; } = new List<Subsection>();
    public ICollection<SparkHistoryItem> SparkHistoryItems { get; set; } = new List<SparkHistoryItem>();
    public ICollection<Annotation> Annotations { get; set; } = new List<Annotation>();
    public ICollection<Snippet> Snippets { get; set; } = new List<Snippet>();
    public ICollection<DailyGoal> DailyGoals { get; set; } = new List<DailyGoal>();
    public ICollection<RevisionComment> RevisionComments { get; set; } = new List<RevisionComment>();
    public ICollection<StoryElement> StoryElements { get; set; } = new List<StoryElement>();
    public ICollection<GraphEdge> GraphEdges { get; set; } = new List<GraphEdge>();
    public ICollection<GroupEdge> GroupEdges { get; set; } = new List<GroupEdge>();
    public ICollection<NodePosition> NodePositions { get; set; } = new List<NodePosition>();
    public ICollection<GraphGroup> GraphGroups { get; set; } = new List<GraphGroup>();
    public ICollection<Snapshot> Snapshots { get; set; } = new List<Snapshot>();
    public ICollection<StoryStateSnapshot> StoryStateSnapshots { get; set; } = new List<StoryStateSnapshot>();
    public ICollection<Volume> Volumes { get; set; } = new List<Volume>();
    public ICollection<VolumeEntity> VolumeEntities { get; set; } = new List<VolumeEntity>();
    public ICollection<SessionArchiveItem> SessionArchiveItems { get; set; } = new List<SessionArchiveItem>();
    public ICollection<Branch> Branches { get; set; } = new List<Branch>();
    public ICollection<AuthorProfile> AuthorProfiles { get; set; } = new List<AuthorProfile>();
    public ICollection<StoryDocument> StoryDocuments { get; set; } = new List<StoryDocument>();
    public ICollection<GeneratedStory> GeneratedStories { get; set; } = new List<GeneratedStory>();
    public ICollection<VoiceProfile> VoiceProfiles { get; set; } = new List<VoiceProfile>();
    public ICollection<ResearchDocument> ResearchDocuments { get; set; } = new List<ResearchDocument>();
    public ICollection<ResearchChunk> ResearchChunks { get; set; } = new List<ResearchChunk>();
    public ICollection<ResearchTag> ResearchTags { get; set; } = new List<ResearchTag>();
}
