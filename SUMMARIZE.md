## Objective
Add organization-scoping (`Guid? organizationId = null`) to Batch 4 services: VoiceProfile, VolumeEntity, AuthorProfile, Bible, Story, Chapter, Scene, plus controllers.

## Pattern
- Interface: `Guid? organizationId = null` after `userId`
- Implementation filter: `e.Story!.UserId == userId && (organizationId == null || e.Story!.OrganizationId == organizationId)`
- `EnsureStoryAccess`/`EnsureAccess`: check `organizationId` too
- Controller: pass `organizationId: OrganizationId`
- StoryService: filter on `s.OrganizationId` directly
- SceneService: navigates `s.Chapter!.Story!`, uses `EnsureAccess`

## Completed
- Batch 4 interfaces (7 services): IVoiceProfileService, IVolumeEntityService, IAuthorProfileService, IBibleService, IStoryService, IChapterService, ISceneService
- Batch 4 implementations (7 services): VoiceProfileService, VolumeEntityService, AuthorProfileService, BibleService, StoryService, ChapterService, SceneService
- Batch 4 controllers (4): VoiceProfileController, VolumeEntityController, AuthorProfileController, BibleController
- Pre-Batch-4 controller fixups: AnnotationController, CharacterRelationshipController, DailyGoalController
- Build passes with zero errors

## Remaining Work
- Batch 5+ services identified: SnapshotService, SnippetService, EntityService, ResearchChunkService, RevisionCommentService, ResearchService, OutlineService, WritingSessionService, DailyGoalService, StoryElementService, StoryStateSnapshotService, CharacterRelationshipService, AnnotationService, PlotPointService — implementations need org-scoping verification
