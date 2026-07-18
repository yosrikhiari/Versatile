# CQRS Migration Plan

## Pattern (Story is the template)

For each entity, create under `Versatile.Application`:
```
{Entity}/
  Commands/
    Create{Entity}Command.cs      # record : IRequest<{Entity}Dto>
    Update{Entity}Command.cs
    Delete{Entity}Command.cs
  Queries/
    Get{Entity}sQuery.cs
    Get{Entity}ByIdQuery.cs
  Handlers/
    Create{Entity}Handler.cs      # IRequestHandler<Create{Entity}Command, {Entity}Dto>
    Update{Entity}Handler.cs
    Delete{Entity}Handler.cs
    Get{Entity}sHandler.cs
    Get{Entity}ByIdHandler.cs
  Validators/
    Create{Entity}Validator.cs    # AbstractValidator<Create{Entity}Command>
    Update{Entity}Validator.cs
```

Controller pattern: inject `IMediator`, replace `_service.Method()` with `_mediator.Send(new Query/Command(...))`.

Infrastructure services are removed—the handler owns the EF/db logic directly.

## Batches

| # | Entity | Controllers | Endpoints | Risk |
|---|--------|------------|-----------|------|
| 1 | Chapter, Scene, Section, Subsection | 4 | ~20 | Low — CRUD-only, clean boundaries |
| 2 | Volume, VolumeEntity, Manuscript | 3 | ~15 | Low |
| 3 | Entity, StoryElement, CharacterRelationship | 3 | ~15 | Low |
| 4 | Annotation, RevisionComment, Snippet | 3 | ~15 | Low |
| 5 | Research, ResearchDocument, ResearchChunk, ResearchTag | 4 | ~20 | Medium — file/upload concerns |
| 6 | GraphEdge, GraphGroup, GroupEdge, NodePosition | 4 | ~20 | Medium — visualization data |
| 7 | BibleEntry, Flow, PlotThread | 3 | ~15 | Low |
| 8 | GeneratedStory, StoryDocument, VoiceProfile | 3 | ~15 | Medium — AI pipeline integration |
| 9 | Snapshot, StoryStateSnapshot, SessionArchiveItem | 3 | ~15 | Medium — archival logic |
| 10 | AuthorProfile, DailyGoal, SparkHistoryItem | 3 | ~15 | Low |
| 11 | Auth, ApiKeys, Embedding | 3 | ~15 | High — auth/encryption sensitive |

## After all batches

- Remove `RegisterServicesByConvention` from Infrastructure DI
- Remove all `I*Service` / `*Service` from `Infrastructure.Services`
- Delete `Application.Services` (now empty)
- Delete unused DTO request types moved into commands
- Run all tests

## Test gating

Each batch must produce a passing `dotnet test` before the next batch starts.
