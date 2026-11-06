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

## 🔄 Synced (14 Dexie tables, 13 backend entities)

Entities in `SYNC_ENTITIES` that flow local ⇄ server. `characters` and `locations` share the backend
`Entity` table, told apart by `type`.

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
| `researchDocuments` | ResearchDocument | `/story/{id}/research-document`; the document text goes up as `content` |
| `researchChunks` | ResearchChunk | |
| `researchTags` | ResearchTag | |
| `branches` | Branch | `BranchController` (added 2026-10-04). Pushed right after projects, serially (self-referencing `sourceBranchId`) |

---

## 📍 Local-only (17 entities)

Have both backend representation and IndexedDB table but intentionally NOT synced. Each entry explains why.

| Dexie Table | Backend Entity | Reason |
|-------------|----------------|--------|
| `users` | User | Browser-local login accounts (username + local password hash); the server account is a separate JWT login, so nothing is copied across |
| `annotations` | Annotation | Inline edit suggestions / scratch notes; session-scoped |
| `authorProfile` | AuthorProfile | Per-user local preferences; not cross-device |
| `dailyGoals` | DailyGoal | Local session goals; no server equivalent needed |
| `generatedStories` | GeneratedStory | AI generation history; cached locally only |
| `graphEdges` | GraphEdge | Canvas/story-graph layout; carries a chapter validity window + `runId` since v47. The backend `GraphEdge` has no `validFromChapter` / `validUntilChapter` / `runId` columns, so syncing this table would need a migration first |
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
| `sceneLabels` | SceneLabel | Reviewer labels for calibration. The backend table has an optional `SubsectionId` (stable scene identity) and a migration, but there is no label mapper or sync protocol yet, so labels do not converge across devices and are not evidence of cross-device identity |

Backend `DbSet`s with **no Dexie table any more** (server-side kept for backward compat, nothing writes them from the SPA): `Chapter`, `Scene` (superseded by sections/subsections in v13), `GraphGroup` (removed from Dexie; data lives in `graphGroupsV2`), `NodePosition` (dropped in v39; `graphNodePositions` / `graphNodeInstances` replace it).

---

## 📱 Client-only (26 tables)

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
| `chapterDigests` | Chapter rollup of scene digests (v45; per branch since v55) |
| `volumeDigests` | Volume rollup (v45; per branch since v55) |
| `entityStates` | Entity-state timeline for contradiction candidates (v45/v47) |
| `analysisQueue` | Persistent idle-priority analysis work queue (v46) |
| `contentVectors` | Embeddings of bible entities and scenes for Related / Lookup (v51) |
| `graphCheckpoints` | LangGraph writing-orchestrator checkpoints, one row per run thread (v54) |
| `agentDecisions` | Editor-agent decision log, one row per superstep (v54) |
| `humanReviewStudies` | Imported frozen human-review pack (v58); local-only so a rater's study cannot sync |
| `humanReviewSessions` | One anonymous rater/pass session per study (v58) |
| `humanReviewResponses` | One Keep/Revise + dimension-mark response per session/scene (v58) |

The digest and analysis tables are derived artifacts: rebuildable from prose, so never synced.

**Column-level notes (schema v49):** entity `metadata` (custom fields) and `tags` ride inside
the server Entity's `metadata` JSON blob for characters and locations; plot threads have no
server-side blob, so their custom fields and tags are local-only. Section/subsection `pov`,
`location`, `charactersPresent` and `wordCount` are local-only until the backend gains the
columns.

`projects.cloudAuditOptIn` is also local-only: it is cloud consent for one
project from one device. Pushing it would opt a second device in without that
device's user acting. See `docs/ETHICS-AND-LIMITATIONS.md` §3.

**Links between rows (fixed 2026-10-04):** a chapter's `volumeId` and `branchId` and a scene's
`branchId`, `order` and `sectionId` (a scene moved to another chapter) now go up as server ids and
come back as local ids; the backend `Section` / `Subsection` gained `BranchId`
(`AddBranchIdToSectionsAndSubsections`). The server reads `null` as "leave the link" and the empty
GUID as "clear it", so the client sends the empty GUID for no link; a link whose target has not
reached the server yet fails the row, which stays pending and goes up on a later cycle with the
link intact. Subsection `contentStatus` is local-only.

---

## 🖥 Server-only (7 entities)

Exist only in the backend database — no IndexedDB counterpart.

| Backend Entity | DbSet | Reason |
|----------------|-------|--------|
| Organization | `DbSet<Organization>` | Multi-tenant identity; server-managed |
| OrganizationMembership | `DbSet<OrganizationMembership>` | Org membership join table; server-managed |
| Flow | `DbSet<Flow>` | Story-flow graph metadata; frontend uses graphEdges/graphNodePositions directly |
| BibleEntry | `DbSet<BibleEntry>` | Story-bible entries; no Dexie counterpart |
| OutboxMessage | `DbSet<OutboxMessage>` | Infrastructure: outbox pattern for event-driven processing |
| AuditEntry | `DbSet<AuditEntry>` (AuditLog) | Server audit trail only |
| SyncTombstone | `DbSet<SyncTombstone>` | Deletion records for pull convergence; read via `GET /api/story/{storyId}/sync/tombstones`, never stored locally |

---

## Checked against the code (2026-09-15)

`SYNC_ENTITIES` in `sync-mapper.ts` lists exactly the 14 tables above; the backend `DbSet`s match the
local-only and server-only lists (the `Research`/ResearchNotes set this doc used to list was removed by the
`RemoveResearchNotes` migration). The API boots against an empty Postgres 16, applies its migrations
in order (currently 9, ending with `AddSyncTombstones`) and answers `/health` with `database` and `ai_provider`
healthy; the backend suite is 985 tests green. A two-client sync run (register on the server through the
editor's sign-in, edit on two browsers) has not been exercised in this audit — it needs a server account.

**Re-checked 2026-10-04:** the table lists above still match `SYNC_ENTITIES` (14 tables), the 53
Dexie tables declared through schema v55 and the backend `DbSet`s.

**First real round trip (2026-10-04).** `src/tests/live/syncRoundTrip.live.js` runs against the
compose stack (Postgres, Redis, API): device A pushes two projects (branches, a volume, a chapter
and scene on a fork, characters, a location, a research document, a manuscript), the local
database is wiped and pulled back as device B, which clears a link, deletes a row and pushes again;
every step is checked against the server's own answers. It passes. Getting there fixed:

- `api()` never unwrapped the `{ data, message }` envelope, so no push got a server id (and login
  read `token` off the envelope too); paged lists (`items`) were not unwrapped or followed.
- Every row went to one global story id, so a second project's rows were filed under the first
  story. Each row now goes to its own project's story; pull runs per synced project.
- Pull wrote locations into `characters` and characters into `locations` (one shared entity
  endpoint, no type filter).
- Research documents posted to a route that does not exist; branches had no endpoint at all;
  manuscripts were rejected for a missing title.
- The delete hook wrote to `pendingDeletions` inside the delete's own transaction and threw, so
  no delete of a synced row was ever recorded or sent; `destroy()` never removed the hooks.
- A new account had no organization, so every story endpoint answered 403; registration now
  creates a personal workspace.
- Writes never invalidated the server's GET cache, so a pull after a push read stale rows for up
  to the cache duration.
- One request per row meets the 100/min per-IP limit on a book's first push; the server now sends
  `Retry-After` and the client waits it out (other 4xx are no longer retried).

Previously open (resolved 2026-10-09, P1-A — live round trip still owed): there
was no batch endpoint, so a first push of a long book took about a minute per
hundred rows; a row deleted on another device stayed locally on pull.

**Update 2026-10-09 (P1-A, implemented; live round trip owed):**
`POST /api/story/{storyId}/sync/batch` carries up to 100 row upserts per
request through the same MediatR commands (same handlers, validation and
tenant checks) as the single-row endpoints — per-item results, one bad row
fails only itself, unknown tables/actions fail their items, 404/405 falls
back to per-row pushes for old servers. Deletes now converge both ways: a
`SyncTombstoneInterceptor` records every deleted synced row server-side
(`SyncTombstones`, RLS-protected, 90-day prune, no Dexie table); pull applies
tombstones per project to clean rows only (locally dirty rows keep
local-wins) via a hook-suppressed delete plus id-map removal, so nothing is
queued back to the server. Backend suite green; frontend sync suites green;
`src/tests/live/syncRoundTrip.live.js` exercises the same client paths
(batch-first) but needs the compose stack to run — not executed here.

**Update 2026-11-05 (root story deletion convergence):** deleting a story now
converges to other devices. `GetSyncTombstonesHandler` returns tombstones even
after the Story row is gone, authorized by organization context and tombstone
ownership (current interceptor rows record the row owner; legacy rows with
`UserId = Guid.Empty` remain fetchable within the same organization). The
interceptor still records the `projects` root tombstone for the deleted story;
child rows removed by database cascade do not produce child tombstones.

Client policy for a root `projects` tombstone: if the local project or any
synced child row in its subtree (`parentField = projectId`) has unpushed local
edits (`pending-create` / `pending-update`), the tombstone is skipped and the
whole subtree is preserved (local wins). If the subtree is clean, the client
deletes the project and its synced child rows with hook-suppressed deletes and
removes id mappings, so nothing is queued back to the server. A preserved
dirty subtree is a conflict that remains until the user resolves/pushes those
local edits; it is not silently discarded.

Verified 2026-11-05: backend unit/integration tombstone tests pass (including
deleted-story fetchability), `src/tests/unit/syncTransport.test.js` covers
clean-subtree delete and dirty-subtree preservation (26 tests), live
`syncRoundTrip.live.js` passes 5/5 against the compose stack (including root
deletion convergence and dirty-subtree preservation), and
`scripts/verify-postgres-rls.sh --live` passes 9/9. The two-client matrix above
adds simultaneous-edit, in-flight-edit, delete-vs-edit and partial-failure
cases in-memory; the live suite still does not run two clients editing the
same row at the same instant.

## Two-client conflict matrix (2026-11-06)

The contract is deliberately simple: no CRDT, no ETag/version column, no
three-way merge. `sync-conflicts.ts` holds timestamp helpers but the transport
does not use them.

| Scenario | What happens | Where it is pinned |
|---|---|---|
| A edits, B is clean and pulls | B receives A's row | existing sync round trip |
| B has local edits, A's row arrives | B keeps its dirty row; remote is skipped | `syncTwoClientConflict.test.js` |
| Both edit and push | later push wins the row; no field merge | `syncTwoClientConflict.test.js` |
| A edits while its push is in flight | row returns to `pending-update`, not `synced`; server holds the old body until the next push | `syncTwoClientConflict.test.js` |
| A deletes a clean subtree | B deletes the project and clean children via the root tombstone | `syncTransport.test.js`, live `syncRoundTrip.live.js` |
| A deletes a subtree B has dirty | B preserves the whole subtree (local wins) and reports a conflict | `syncTransport.test.js` |
| Child arrives before its parent has a server id | child is deferred, not sent with an empty link, and `lastSync` is not stamped | `syncTransport.test.js` |
| A push partially fails | failed rows stay pending, the table is retried; successful siblings are marked | `syncTransport.test.js` |
| Two devices edit the same row simultaneously | no conflict UI and no merge; last writer wins. This is a documented limitation, not co-editing | matrix row above |

The tests use `src/tests/helpers/fakeSyncServer.js`, an in-memory server plus
two clients, so the matrix runs without Docker. The live round trip still
covers the real API path.

## Workflow

- To add a new synced entity: add a `SYNC_ENTITIES` entry in `sync-mapper.ts` + backend endpoint + DbSet migration
- To demote a synced entity to local-only: remove from `SYNC_ENTITIES`, keep backend DbSet, document here
- New local Dexie-only tables: no backend work needed, document here
