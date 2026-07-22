namespace Versatile.Application.DTOs;

// Manuscript
public record ManuscriptDto(Guid Id, Guid StoryId, string Title, string? Content, int WordCount, DateTime CreatedAt, DateTime UpdatedAt);
public record CreateManuscriptRequest(string Title, string? Content, int? WordCount);
public record UpdateManuscriptRequest(string? Title, string? Content, int? WordCount);

// CharacterRelationship
public record CharacterRelationshipDto(Guid Id, Guid StoryId, Guid FromCharacterId, Guid ToCharacterId, string RelationshipType, string? Notes, DateTime CreatedAt);
public record CreateCharacterRelationshipRequest(Guid FromCharacterId, Guid ToCharacterId, string RelationshipType, string? Notes);
public record UpdateCharacterRelationshipRequest(Guid? FromCharacterId, Guid? ToCharacterId, string? RelationshipType, string? Notes);

// PlotThread
public record PlotThreadDto(Guid Id, Guid StoryId, string Title, string Status, string? Notes, int Order, DateTime CreatedAt, DateTime UpdatedAt);
public record CreatePlotThreadRequest(string Title, string? Status, string? Notes);
public record UpdatePlotThreadRequest(string? Title, string? Status, string? Notes, int? Order);

// Section
public record SectionDto(Guid Id, Guid StoryId, Guid? VolumeId, string Title, string? Summary, string? Content, int Order, string Status, string? Tags, DateTime CreatedAt, DateTime UpdatedAt);

// Subsection
public record SubsectionDto(Guid Id, Guid StoryId, Guid SectionId, string Title, string? Summary, string? Content, int Order, string? Tags, DateTime CreatedAt, DateTime UpdatedAt);

// SparkHistoryItem
public record SparkHistoryItemDto(Guid Id, Guid StoryId, string Type, string? Prompt, string? Blueprint, string? GeneratedContent, DateTime CreatedAt);
public record CreateSparkHistoryItemRequest(string Type, string? Prompt, string? Blueprint, string? GeneratedContent);
public record UpdateSparkHistoryItemRequest(string? Type, string? Prompt, string? Blueprint, string? GeneratedContent);

// Annotation
public record AnnotationDto(Guid Id, Guid StoryId, int ParagraphIndex, string? ParagraphId, string Type, string? Original, string? Suggestion, string? Reason, string Status, DateTime CreatedAt);
public record CreateAnnotationRequest(int ParagraphIndex, string? ParagraphId, string Type, string? Original, string? Suggestion, string? Reason, string? Status);
public record UpdateAnnotationRequest(int? ParagraphIndex, string? ParagraphId, string? Type, string? Original, string? Suggestion, string? Reason, string? Status);

// Snippet
public record SnippetDto(Guid Id, Guid StoryId, string Word, int Count, DateTime LastSeen);
public record CreateSnippetRequest(string Word, int Count, DateTime? LastSeen);
public record UpdateSnippetRequest(string? Word, int? Count, DateTime? LastSeen);

// DailyGoal
public record DailyGoalDto(Guid Id, Guid StoryId, DateTime Date, int TargetWords, int CurrentWords, bool Completed);
public record CreateDailyGoalRequest(DateTime Date, int TargetWords, int? CurrentWords, bool? Completed);
public record UpdateDailyGoalRequest(DateTime? Date, int? TargetWords, int? CurrentWords, bool? Completed);

// RevisionComment
public record RevisionCommentDto(Guid Id, Guid StoryId, int ParagraphIndex, int StartOffset, int EndOffset, string? SelectedText, string? Comment, bool Resolved, DateTime CreatedAt);
public record CreateRevisionCommentRequest(int ParagraphIndex, int StartOffset, int EndOffset, string? SelectedText, string? Comment, bool? Resolved);
public record UpdateRevisionCommentRequest(int? ParagraphIndex, int? StartOffset, int? EndOffset, string? SelectedText, string? Comment, bool? Resolved);

// StoryElement
public record StoryElementDto(Guid Id, Guid StoryId, string Type, string Title, double X, double Y, double Width, double Height, string? Data);
public record CreateStoryElementRequest(string Type, string Title, double X, double Y, double? Width, double? Height, string? Data);
public record UpdateStoryElementRequest(string? Type, string? Title, double? X, double? Y, double? Width, double? Height, string? Data);

// GraphEdge
public record GraphEdgeDto(Guid Id, Guid StoryId, string SourceId, string TargetId, string SourceType, string TargetType, string RelationshipType, string? Label, Guid? VolumeId);

// GroupEdge
public record GroupEdgeDto(Guid Id, Guid StoryId, string SourceGroupId, string TargetGroupId, string RelationshipType);

// NodePosition
public record NodePositionDto(Guid Id, Guid StoryId, string NodeId, string NodeType, double X, double Y);

// GraphGroup
public record GraphGroupDto(Guid Id, Guid StoryId, string Label, string Color, string? Data);

// Snapshot
public record SnapshotDto(Guid Id, Guid StoryId, Guid? ChapterId, DateTime Timestamp, string? Label, string? Data);
public record CreateSnapshotRequest(Guid? ChapterId, string? Label, string? Data);
public record UpdateSnapshotRequest(Guid? ChapterId, string? Label, string? Data);

// StoryStateSnapshot
public record StoryStateSnapshotDto(Guid Id, Guid StoryId, DateTime Timestamp, string? Data);
public record CreateStoryStateSnapshotRequest(string? Data);
public record UpdateStoryStateSnapshotRequest(string? Data);

// Volume
public record VolumeDto(Guid Id, Guid StoryId, string Title, string? Description, string Color, int SortOrder, string? ChapterIds, DateTime CreatedAt, DateTime UpdatedAt);

// VolumeEntity
public record VolumeEntityDto(Guid Id, Guid StoryId, Guid VolumeId, string EntityType, string EntityId, bool IsPrimary);
public record CreateVolumeEntityRequest(Guid VolumeId, string EntityType, string EntityId, bool? IsPrimary);
public record UpdateVolumeEntityRequest(Guid? VolumeId, string? EntityType, string? EntityId, bool? IsPrimary);

// SessionArchiveItem
public record SessionArchiveItemDto(Guid Id, Guid StoryId, string Signal, string Type, DateTime Timestamp, string? Data);
public record CreateSessionArchiveItemRequest(string Signal, string Type, DateTime? Timestamp, string? Data);
public record UpdateSessionArchiveItemRequest(string? Signal, string? Type, DateTime? Timestamp, string? Data);

// AuthorProfile
public record AuthorProfileDto(Guid Id, Guid StoryId, string DisplayName, string PenName, string? Bio, string? Settings, DateTime CreatedAt, DateTime UpdatedAt);
public record CreateAuthorProfileRequest(string DisplayName, string PenName, string? Bio, string? Settings);
public record UpdateAuthorProfileRequest(string? DisplayName, string? PenName, string? Bio, string? Settings);

// StoryDocument
public record StoryDocumentDto(Guid Id, Guid StoryId, string DocType, string Title, string? Content, DateTime CreatedAt, DateTime UpdatedAt);
public record CreateStoryDocumentRequest(string DocType, string Title, string? Content);
public record UpdateStoryDocumentRequest(string? DocType, string? Title, string? Content);

// GeneratedStory
public record GeneratedStoryDto(Guid Id, Guid StoryId, string Title, string? Content, DateTime GeneratedAt, int TotalWords, double? QualityScore);
public record CreateGeneratedStoryRequest(string Title, string? Content, int? TotalWords, double? QualityScore);
public record UpdateGeneratedStoryRequest(string? Title, string? Content, int? TotalWords, double? QualityScore);

// VoiceProfile
public record VoiceProfileDto(Guid Id, Guid StoryId, string Name, string? Settings, DateTime CreatedAt, DateTime UpdatedAt);
public record CreateVoiceProfileRequest(string Name, string? Settings);
public record UpdateVoiceProfileRequest(string? Name, string? Settings);

// ResearchDocument
public record ResearchDocumentDto(Guid Id, Guid StoryId, string FileName, string FileType, DateTime ImportedAt, string? Content, string? Notes, DateTime CreatedAt);
public record CreateResearchDocumentRequest(string FileName, string FileType, string? Content, string? Notes);
public record UpdateResearchDocumentRequest(string? FileName, string? FileType, string? Content, string? Notes);

// ResearchChunk
public record ResearchChunkDto(Guid Id, Guid StoryId, Guid DocumentId, int ChunkIndex, string? Content, string? Embedding, DateTime CreatedAt);
public record CreateResearchChunkRequest(Guid DocumentId, int ChunkIndex, string? Content, string? Embedding);
public record UpdateResearchChunkRequest(int? ChunkIndex, string? Content, string? Embedding);

// ResearchTag
public record ResearchTagDto(Guid Id, Guid StoryId, string Name, string Color);
public record CreateResearchTagRequest(string Name, string? Color);
public record UpdateResearchTagRequest(string? Name, string? Color);
