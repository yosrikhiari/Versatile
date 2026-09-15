# Sync Status — Entity Classification

Documents which entities cross the local↔server boundary and which are intentionally local-only.

## Legend

| Status | Meaning |
|--------|---------|
| 🔄 Synced | In `SYNC_ENTITIES` — bidirectional sync between IndexedDB and server |
| 📍 Local-only | Backend DbSet + Dexie table, deliberately excluded from `SYNC_ENTITIES` |
| 📱 Client-only | Dexie table only — no backend DbSet |
| 🖥 Server-only | Backend DbSet only — no Dexie table |

---

## 🔄 Synced (14 entities + backend PolymorphicEntity)

Entities in `SYNC_ENTITIES` that flow local ⇄ server.

| Dexie Table | Backend Entity | Notes |
|-------------|----------------|-------|
| `projects` | Story | Top-level sync root |
| `sections` | Section | Replaced Chapter (v13) |
| `subsections` | Subsection | Replaced Scene (v13) |
| `characters` | Entity (type=Character) | Polymorphic via Entity entity |
| `locations` | Entity (type=Location) | Polymorphic via Entity entity |
| `plotThreads` | PlotThread | |
| `characterRelationships` | CharacterRelationship | |
| `volumes` | Volume | |
| `volumeEntities` | VolumeEntity | |
| `manuscripts` | Manuscript | |
| `researchDocuments` | ResearchDocument | |
| `researchChunks` | ResearchChunk | |
| `researchTags` | ResearchTag | |
| `branches` | Branch | |

---

## 📍 Local-only (16 entities)

Have both backend representation and IndexedDB table but intentionally NOT synced. Each entry explains why.

| Dexie Table | Backend Entity | Reason |
|-------------|----------------|--------|
| `users` | User | Auth identity sourced from external IdP; not synced per-user across devices |
| `annotations` | Annotation | Inline edit suggestions / scratch notes; session-scoped |
| `authorProfile` | AuthorProfile | Per-user local preferences; not cross-device |
| `dailyGoals` | DailyGoal | Local session goals; no server equivalent needed |
| `generatedStories` | GeneratedStory | AI generation history; cached locally only |
| `graphEdges` | GraphEdge | Canvas/story-graph layout; carries a chapter validity window + `runId` since v47 |
| `groupEdges` | GroupEdge | Group-to-group connections on canvas |
| `revisionComments` | RevisionComment | Inline review comments; local draft state |
| `sessionArchive` | SessionArchiveItem | Session history; capped and time-indexed (v48) |
| `snapshots` | Snapshot | Content snapshots; deduped, capped at 40/chapter (v48) |
| `snippets` | Snippet | Autocomplete / phrase snippets; local convenience |
| `sparkHistory` | SparkHistoryItem | AI spark/idea history; local activity log |
| `storyDocuments` | StoryDocument | Draft/export documents; local working copies |
| `storyElements` | StoryElement | Story-bible canvas elements; derived from synced entity data |
| `storyStateSnapshots` | StoryStateSnapshot | Pipeline/undo state; throttled, capped at 50/project (v48) |
| `voiceProfiles` | VoiceProfile | AI voice / narrator profiles; local preferences |

Backend `DbSet`s with **no Dexie table any more** (server-side kept for backward compat, nothing writes them from the SPA): `Chapter`, `Scene` (superseded by sections/subsections in v13), `GraphGroup` (removed from Dexie; data lives in `graphGroupsV2`), `NodePosition` (dropped in v39; `graphNodePositions` / `graphNodeInstances` replace it).

---

## 📱 Client-only (20 tables)

Exist only in IndexedDB — no server equivalent.

| Dexie Table | Purpose |
|-------------|---------|
| `pendingDeletions` | Tracks records queued for server-side deletion |
| `embeddingCache` | Cached AI embeddings for local similarity search |
| `dialogueIndex` | Full-text dialogue search index |
| `storyShapeAnalysis` | Cached story-structure analysis results |
| `chatSessions` | AI / character chat session history |
| `genRuns` | Generation run checkpoints (crash-safe resume) |
| `projectBlurbs` | Cached project blurbs / summaries |
| `evalResults` | Scene evaluation results, keyed `[projectId+sceneId+evalType]` |
| `evalPreferences` | Pairwise draft ranking (v43) |
| `optimizationSessions` | Prompt-optimisation sessions per scene |
| `aiResponseCache` | Semantic AI response cache (v38) |
| `graphNodePositions` | Normalised per-node canvas positions (v36) |
| `graphGroupsV2` | Normalised canvas groups (v36) |
| `graphNodeParents` | Node → group membership (v36) |
| `graphNodeInstances` | Node instances per project (v39) |
| `sceneDigests` | One digest per scene, content-hash invalidated (v44) |
| `chapterDigests` | Chapter rollup of scene digests (v45) |
| `volumeDigests` | Volume rollup (v45) |
| `entityStates` | Entity-state timeline for contradiction candidates (v45/v47) |
| `analysisQueue` | Persistent idle-priority analysis work queue (v46) |

The digest and analysis tables are derived artifacts: rebuildable from prose, so never synced.

---

## 🖥 Server-only (7 entities)

Exist only in the backend database — no IndexedDB counterpart.

| Backend Entity | DbSet | Reason |
|----------------|-------|--------|
| Organization | `DbSet<Organization>` | Multi-tenant identity; server-managed |
| OrganizationMembership | `DbSet<OrganizationMembership>` | Org membership join table; server-managed |
| Research | `DbSet<Research>` (ResearchNotes) | Possibly dead code — distinct from ResearchDocument |
| Flow | `DbSet<Flow>` | Story-flow graph metadata; frontend uses graphEdges/nodePositions directly |
| BibleEntry | `DbSet<BibleEntry>` | Story-bible entries; no Dexie counterpart |
| OutboxMessage | `DbSet<OutboxMessage>` | Infrastructure: outbox pattern for event-driven processing |
| AuditEntry | `DbSet<AuditEntry>` (AuditLog) | Server audit trail only |

---

## Workflow

- To add a new synced entity: add a `SYNC_ENTITIES` entry in `sync-mapper.ts` + backend endpoint + DbSet migration
- To demote a synced entity to local-only: remove from `SYNC_ENTITIES`, keep backend DbSet, document here
- New local Dexie-only tables: no backend work needed, document here
