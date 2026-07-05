using System.Text.Json.Serialization;

namespace Versatile.Application.DTOs;

public record StartSeriesGenerationRequest(
    string StoryId,
    int VolumeCount,
    int ChaptersPerVolume = 10,
    int ScenesPerChapter = 3,
    int ParallelLimit = 1,
    int MaxCriticRetries = 3,
    bool EnableEntityBootstrapper = true
);

public record GeneratedSceneDto(
    Guid Id,
    int Order,
    string Title,
    string Content,
    int WordCount,
    double? QualityScore
);

public record GeneratedChapterDto(
    Guid Id,
    int Order,
    string Title,
    int WordCount,
    List<GeneratedSceneDto> Scenes
);

public record GeneratedVolumeDto(
    Guid Id,
    int SortOrder,
    string Title,
    string Description,
    int WordCount,
    List<GeneratedChapterDto> Chapters
);

public record SeriesGenerationResultDto(
    Guid StoryId,
    Guid? GenerationId,
    List<GeneratedVolumeDto> Volumes,
    int TotalVolumes,
    int TotalChapters,
    int TotalScenes,
    int TotalWords,
    DateTime GeneratedAt
);

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(VolumeProgress), typeDiscriminator: "volume")]
[JsonDerivedType(typeof(ChapterProgress), typeDiscriminator: "chapter")]
[JsonDerivedType(typeof(SceneProgress), typeDiscriminator: "scene")]
[JsonDerivedType(typeof(SceneTokenProgress), typeDiscriminator: "scene_token")]
[JsonDerivedType(typeof(GenerationErrorProgress), typeDiscriminator: "error")]
[JsonDerivedType(typeof(DoneProgress), typeDiscriminator: "done")]
public abstract record SeriesProgress;

public record VolumeProgress(int Volume, int TotalVolumes) : SeriesProgress;

public record ChapterProgress(int Volume, int Chapter, int TotalChapters) : SeriesProgress;

public record SceneProgress(int Volume, int Chapter, int Scene, int TotalScenes) : SeriesProgress;

public record SceneTokenProgress(int Volume, int Chapter, int Scene, int Tokens) : SeriesProgress;

public record GenerationErrorProgress(string Message, bool IsWarning) : SeriesProgress;

public record DoneProgress(string Summary) : SeriesProgress;

public record ChapterSceneSchema(
    [property: JsonPropertyName("chapter_title")] string ChapterTitle,
    [property: JsonPropertyName("chapter_summary")] string ChapterSummary,
    [property: JsonPropertyName("scenes")] List<SceneSchema> Scenes
);

public record SceneSchema(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("summary")] string Summary,
    [property: JsonPropertyName("setting")] string Setting,
    [property: JsonPropertyName("point_of_view")] string PointOfView,
    [property: JsonPropertyName("characters_present")] List<string> CharactersPresent,
    [property: JsonPropertyName("page_count")] double PageCount,
    [property: JsonPropertyName("order")] int Order
);

public record SceneProseResult(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("content")] string Content,
    [property: JsonPropertyName("word_count")] int WordCount
);

public record CriticEvaluation(
    [property: JsonPropertyName("scores")] Dictionary<string, int> Scores,
    [property: JsonPropertyName("overall")] int Overall,
    [property: JsonPropertyName("issues")] List<CriticIssue> Issues,
    [property: JsonPropertyName("verdict")] string Verdict
);

public record CriticIssue(
    [property: JsonPropertyName("severity")] string Severity,
    [property: JsonPropertyName("dimension")] string Dimension,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("suggestion")] string Suggestion
);

public record RevisedSceneResult(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("content")] string Content,
    [property: JsonPropertyName("revision_notes")] string RevisionNotes
);

public record EnrichedEntities(
    [property: JsonPropertyName("characters")] List<EnrichedCharacter> Characters,
    [property: JsonPropertyName("locations")] List<EnrichedLocation> Locations,
    [property: JsonPropertyName("plot_threads")] List<EnrichedPlotThread> PlotThreads
);

public record EnrichedCharacter(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("role")] string Role,
    [property: JsonPropertyName("personality_traits")] List<string> PersonalityTraits,
    [property: JsonPropertyName("description")] string Description
);

public record EnrichedLocation(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("significance")] string Significance
);

public record EnrichedPlotThread(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("status")] string Status
);
