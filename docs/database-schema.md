# Database Schema

## Entity Catalog

All domain entities inherit from `BaseEntity` (Id, CreatedAt, UpdatedAt). Story-scoped entities inherit `UserOwnedEntity` (adds UserId, OrganizationId).

### Tenant-Anchored (UserOwnedEntity → BaseEntity)

All story-scoped entities carry `UserId` (required) + `OrganizationId` (optional). Multitenancy is enforced at the query level via a global `HasQueryFilter` on `OrganizationId`.

#### Story Aggregate Root

| Entity | Table | Description |
|---|---|---|
| **Story** | Stories | Root aggregate — holds fiction metadata (title, premise, genre, tone, writingStyle, targetAudience) |
| **Chapter** | Chapters | Narrative chapters belonging to a Story |
| **Scene** | Scenes | Individual scenes within a Chapter |
| **Section** | Sections | Hierarchical sections within a Story (may belong to a Volume) |
| **Subsection** | Subsections | Child sections under a Section |
| **Branch** | Branches | Alternate version branches (git-like forking), self-references via SourceBranchId |
| **Volume** | Volumes | Collection grouping, referenced by Section.VolumeId and VolumeEntity.VolumeId |

#### Entities & Characters

| Entity | Table | Description |
|---|---|---|
| **Entity** | Entities | Characters, locations, items, etc. — polymorphic via `EntityType` discriminator |
| **CharacterRelationship** | CharacterRelationships | Directed relationship between two entities (from→to with type label) |
| **VoiceProfile** | VoiceProfiles | Voice/tone configuration for characters |
| **AuthorProfile** | AuthorProfiles | Multi-author support per Story |

#### Plot & Structure

| Entity | Table | Description |
|---|---|---|
| **PlotThread** | PlotThreads | Narrative threads with status tracking |
| **Flow** | Flows | Story flow graph (one-to-one with Story) |
| **GraphEdge** | GraphEdges | Edges in the story graph |
| **GroupEdge** | GroupEdges | Edges within graph groups |
| **GraphGroup** | GraphGroups | Named groupings of graph nodes |
| **NodePosition** | NodePositions | Canvas/node positions for the visual graph |
| **StoryElement** | StoryElements | Typed elements within the story structure |
| **StoryDocument** | StoryDocuments | Full-story document versions |
| **StoryStateSnapshot** | StoryStateSnapshots | Point-in-time story state captures |

#### Writing

| Entity | Table | Description |
|---|---|---|
| **Manuscript** | Manuscripts | Full manuscript content (rich text + word count) |
| **Snippet** | Snippets | Saved writing fragments/notes |
| **Annotation** | Annotations | Inline annotations on sections/subsections |
| **RevisionComment** | RevisionComments | Review comments for collaborative editing |
| **SparkHistoryItem** | SparkHistoryItems | History of AI spark/idea generation |
| **DailyGoal** | DailyGoals | Per-story writing goals/tracking |
| **GeneratedStory** | GeneratedStories | AI-generated story variants |

#### Research

| Entity | Table | Description |
|---|---|---|
| **ResearchDocument** | ResearchDocuments | Uploaded research files |
| **ResearchChunk** | ResearchChunks | Text chunks from documents with vector embeddings |
| **ResearchTag** | ResearchTags | Tag taxonomy for research items |

#### Snapshots & Archive

| Entity | Table | Description |
|---|---|---|
| **Snapshot** | Snapshots | Generic snapshots |
| **StoryStateSnapshot** | StoryStateSnapshots | Story-scoped state captures |
| **SessionArchiveItem** | SessionArchiveItems | Archived creative-writing session items |

#### Volume Linking

| Entity | Table | Description |
|---|---|---|
| **VolumeEntity** | VolumeEntities | Cross-reference table linking entities to volumes |
| **BibleEntry** | BibleEntries | Story-bible references |

### Tenant-Exempt (BaseEntity only)

These entities do NOT carry OrganizationId and bypass the tenant filter:

| Entity | Table | Description |
|---|---|---|
| **User** | Users | Application users (Username, Email — both unique) |
| **Organization** | Organizations | Multi-tenant orgs (Slug — unique) |
| **OrganizationMembership** | OrganizationMemberships | User ↔ Organization join (composite PK) |
| **AuditEntry** | AuditLog | Immutable audit trail (action, entityType, entityId, userId, orgId, timestamp) |
| **OutboxMessage** | OutboxMessages | Outbox pattern for transactional event publishing |

## Inheritance Hierarchy

```
BaseEntity
├── Id: Guid (PK, default Guid.NewGuid())
├── CreatedAt: DateTime (default UtcNow)
└── UpdatedAt: DateTime (default UtcNow)

UserOwnedEntity : BaseEntity
├── UserId: Guid (required)
└── OrganizationId: Guid? (nullable, used for multi-tenancy)

Applied to: All story-scoped entities (Story, Chapter, Scene, Section,
  Subsection, Entity, CharacterRelationship, Volume, etc.)
```

## Key Relationships

### Story as Aggregate Root

`Story` is the primary aggregate root. Most entities reference it via `StoryId` with `Cascade` delete. The story graph is rooted at:

```
Story
├── Chapters ── Scenes
├── Sections ── Subsections
├── Entities ── CharacterRelationships (from/to)
├── Volumes ── VolumeEntities
├── Branches (self-referencing via SourceBranchId)
├── PlotThreads
├── GraphEdges, GroupEdges, GraphGroups, NodePositions
├── Manuscripts, Snippets, Annotations, RevisionComments
├── ResearchDocuments ── ResearchChunks
├── ResearchTags
├── Snapshots, StoryStateSnapshots, SessionArchiveItems
├── StoryElements, StoryDocuments, GeneratedStories
├── VoiceProfiles, AuthorProfiles
├── DailyGoals
├── BibleEntries
├── SparkHistoryItems
└── Flow (1:1 unique index)
```

### Special FK Constraints

| Foreign Key | Delete Behavior |
|---|---|
| Story → User | Cascade |
| Chapter → Story | Cascade |
| Scene → Chapter | Cascade |
| Entity → Story | Cascade |
| CharacterRelationship → Story | Cascade |
| ResearchChunk → Document | Restrict (no cascade) |
| Subsection → Section | Restrict |
| VolumeEntity → Volume | Restrict |
| Section → Volume | SetNull |
| Branch → SourceBranch | SetNull |
| Flow → Story | Cascade (1:1 via unique index) |

## Multi-Tenancy Strategy

**Tenant isolation level:** Soft (query filter) per OrganizationId.

**Mechanism:**
1. `IOrganizationContext` provides the current `OrganizationId`
2. `ApplicationDbContext` applies a global `HasQueryFilter` on every `UserOwnedEntity` that checks `OrganizationId == _tenantId` (or skips when `_tenantId` is null)
3. `PropagateOrganizationId()` auto-fills `OrganizationId` on new entities during `SaveChangesAsync`
4. `EnsureTenantSafety()` is a static assertion that all non-exempt `DbSet<>` types extend `UserOwnedEntity`

**Exempt entities:** User, Organization, OrganizationMembership, AuditEntry, OutboxMessage

**Indexes:** Every `UserOwnedEntity` has an index on `OrganizationId`.

## Sync Architecture

### Offline-First Strategy

The frontend sync layer uses Dexie.js (IndexedDB) as the source of truth and syncs bidirectionally with the backend:

```
IndexedDB (Dexie.js) ←→ SyncEngine ←→ Backend API (ASP.NET Core)
```

### Sync Entities

Entities synced with the backend (defined in `sync-mapper.ts:SYNC_ENTITIES`):

| Table | API Endpoint | Top-Level | Sync Priority |
|---|---|---|---|
| projects (Stories) | `/story` | Yes (provides storyApiId) | 0 |
| volumes | `/story/{id}/volume` | No | 1 |
| characters | `/story/{id}/entity` | No (type=Character) | 2 |
| locations | `/story/{id}/entity` | No (type=Location) | 3 |
| plotThreads | `/story/{id}/plot-thread` | No | 4 |
| sections | `/story/{id}/section` | No | 5 |
| subsections | `/story/{id}/subsection` | No | 6 |
| characterRelationships | `/story/{id}/character-relationship` | No | 7 |
| volumeEntities | `/story/{id}/volume-entity` | No | 8 |
| manuscripts | `/story/{id}/manuscript` | No | 9 |
| researchDocuments | `/story/{id}/research` | No | 10 |
| researchChunks | `/story/{id}/research-chunk` | No | 11 |
| researchTags | `/story/{id}/research-tag` | No | 12 |
| branches | `/story/{id}/branch` | No | 13 |

### ID Mapping

`SyncIdMap` maintains bidirectional translation between IndexedDB local IDs and backend API IDs. The map is rebuilt on init from `apiId` fields in IndexedDB records.

### Conflict Resolution

Strategies defined in `sync-conflicts.ts`:
- **LAST_WRITE_WINS** (default): Compares `updatedAt` timestamps
- **SKIP_CONFLICTED**: Leaves local changes when remote conflicts exist
- **MANUAL**: Reserved for interactive resolution

### Data Flow

1. **Push** (`_installHooks`): IndexedDB `creating`/`updating` hooks set `syncStatus` to `pending-create` or `pending-update`. Deletions are recorded in `pendingDeletions` table.
2. **Flush** (30s interval): `SyncEngine.push()` iterates sync-ordered tables, calling `transport.pushTable()` for each, then processes pending deletions. Rows within a table push with bounded concurrency (4; `branches` stays serial because it self-references). A row that fails is surfaced and retried, and a table with stranded rows is re-pushed rather than skipped; a re-push of a record that already has an `apiId` is a PUT update, never a duplicate POST.
3. **Pull**: `SyncEngine.pull()` fetches all entities for the current story and upserts them into IndexedDB.
4. **Sync Now**: `syncNow()` calls push then pull in sequence.

## Row-Level Security

Implemented via `AddRowLevelSecurity` migration. RLS policies enforce the `OrganizationId` tenant filter at the database level, providing a defense-in-depth layer beyond the application-level query filter. Reading an organisation you do not belong to returns 403 (membership is checked before existence — see `API.md`).

## Migration Workflow

**Current migrations (6 total):**
1. `InitialCreate` — Base schema with all entities
2. `AddOrganizationIdIndexes` — Indexes on OrganizationId for tenant filtering
3. `AddRowLevelSecurity` — Database-level RLS policies
4. `AddAuditLog` — AuditEntry/AuditLog table
5. `AddBranchesTable` — Branch entity (git-like forking, self-referencing `SourceBranchId`)
6. `RemoveResearchNotes` — drops the dead `Research`/`ResearchNotes` set (superseded by `ResearchDocument`)

Migrations run automatically on API start except in the `Testing` environment.

**Test coverage** (`MigrationSmokeTests.cs`):
- All migrations are discoverable
- Model builds with 36+ entity types
- Migration naming convention verified

**Creating new migrations:**
```bash
cd backend/Versatile.Infrastructure
dotnet ef migrations add <Name> -s ../Versatile.Api
dotnet ef database update -s ../Versatile.Api
```

## Not-Synced Entities

These server-only entities are not synced to IndexedDB:

- Users, Organizations, OrganizationMemberships
- AuditLog
- OutboxMessages
- StoryElements, StoryDocuments, StoryStateSnapshots
- GeneratedStories
- Snapshots
- GraphEdges, GroupEdges, GraphGroups, NodePositions (the last two have no Dexie table any more — see `docs/sync-status.md`)
- RevisionComments, DailyGoals, SparkHistoryItems
- Annotations, Snippets, AuthorProfiles, VoiceProfiles
- BibleEntries, Flow
