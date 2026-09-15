# Dexie Schema Changelog

Each entry documents what changed, why, and whether a data-migration handler exists in `db-migrations.ts` (`MIGRATIONS` map, keyed by version).

| Ver | Tables changed | What changed | Why | Migration |
|-----|---------------|-------------|-----|-----------|
| 11 | 19 tables | Initial schema: projects, manuscripts, characters, characterRelationships, locations, plotThreads, sparkHistory, annotations, snippets, dailyGoals, revisionComments, storyElements, graphEdges, groupEdges, nodePositions, graphGroups, snapshots, volumes, volumeEntities. `chapters`/`scenes` removed in Phase 3 (replaced by `sections`/`subsections` in v13). | Foundation | Backfills `volumeId: null` on `graphEdges` |
| 12 | characters | Added `portrait` field | Store character portrait image ref | None needed |
| 13 | sections, subsections | Added `sections` and `subsections` tables (replaced chapters/scenes concept) | Restructure narrative hierarchy | Copies all chapters→sections, scenes→subsections |
| 14 | sessionArchive, authorProfile, storyStateSnapshots | Added 3 new tables | Session persistence, profile, undo snapshots | None needed |
| 15 | characters, storyDocuments | Added `lastEditedAt` to characters; added `storyDocuments` table | Track edit timestamps, store AI-generated drafts | None needed |
| 16 | generatedStories | Added table | Store AI-generated story output | None needed |
| 17 | voiceProfiles | Added table | Character voice configuration profiles | None needed |
| 18 | storyDocuments | Added compound index `[projectId+docType]` | Efficient per-project/doc-type queries | None needed |
| 19 | researchDocuments, researchChunks | Added 2 tables | Research document storage and chunking | None needed |
| 20 | — | No-op (empty stores) | Placeholder to re-index DB | None needed |
| 21 | researchTags | Added table | Tag research documents | None needed |
| 22 | 9 tables + pendingDeletions | Added sync fields (`apiId`, `syncStatus`, `lastSyncedAt`) to projects, manuscripts, characters, characterRelationships, locations, plotThreads, sections, subsections, volumes, volumeEntities; added `pendingDeletions` table | Sync infrastructure for offline-first | Backfill sync fields with empty string task |
| 23 | embeddingCache | Added table | Cache vector embeddings for RAG | None needed |
| 24 | researchDocuments | Added sync fields (`apiId`, `syncStatus`, `lastSyncedAt`) | Research doc sync support | None needed |
| 25 | — | No-op (empty stores) | Placeholder to trigger re-index | None needed |
| 26 | projects, users | Added `userId` to projects; added `users` table | Multi-user support | Seeds test user in DEV_MODE |
| 27 | dialogueIndex | Added table | Index dialogue by speaker for analysis | None needed |
| 28 | storyShapeAnalysis | Added table | Store story arc analysis results | None needed |
| 29 | chatSessions | Added table | Session history for AI chat | None needed |
| 30 | genRuns | Added table | Track AI generation runs/attempts | None needed |
| 31 | characters, locations, plotThreads, subsections | Added `generationStatus` to characters/locations/plotThreads, `contentStatus` to subsections, `createdAt`/`updatedAt` to chars/locs/threads | Track AI generation state | Backfills generationStatus=approved, contentStatus=draft/generated, createdAt/updatedAt |
| 32 | projectBlurbs | Added table | Store AI-generated project blurbs | None needed |
| 33 | evalResults | Added table | Store scene evaluation results | None needed |
| 34 | branches, sections, subsections | Added `branches` table; added `branchId`, `[projectId+branchId]` to sections and subsections | Branching narrative support | Backfill branchId=null on sections/subsections |
| 35 | branches, sections, subsections | Added `description`, `status` to branches; sections/subsections re-declared (no change) | Branch metadata (description, active status) | Backfills description='', status='active' on branches |
| 36 | graphNodePositions, graphGroupsV2, graphNodeParents | Added 3 normalized graph tables; old `nodePositions`/`graphGroups` kept for backward compat | Normalize per-project JSON blobs into row-per-entity tables with compound keys | Splits `nodePositions` into `graphNodePositions`, `graphGroups` into `graphGroupsV2` + `graphNodeParents` |
| 37 | evalResults, optimizationSessions, snapshots, sparkHistory | Added `[projectId+sceneId]`, `[projectId+evalType]`, `[projectId+sceneId+evalType]` to evalResults; `[projectId+sceneId]` to optimizationSessions; `[projectId+chapterId]` to snapshots; `[projectId+type]` to sparkHistory | Compound indexes remove JS `.filter()` scans on query hotspots | None (schema-only — indexes are Dexie-level, no data transform) |
| 38 | aiResponseCache | Added table with `&hash` PK and `[provider+model+temperature+feature]` compound index | Semantic AI response cache for writer/critic features | None needed |
| — | graphGroups | Removed from schema (v11 + v36 stores), dbRecovery.js arrays, and test mocks | D-21: Legacy table cleanup — data migrated to graphGroupsV2 in v36 | v36 migration now guards against absent table for fresh DBs |
| 39 | graphNodeInstances, nodePositions | Added `graphNodeInstances` (`[projectId+nodeId]`); dropped `nodePositions` | Row-per-node instance table replaces the per-project instances map | Splits `nodePositions.instances` into `graphNodeInstances` rows |
| 40 | researchChunks | Added `syncStatus`, `lastSyncedAt` | Research chunk sync support | None needed |
| 41 | researchTags | Added `syncStatus`, `lastSyncedAt` | Was missing from the v22 sync expansion | None needed |
| 42 | branches | Added `syncStatus`, `lastSyncedAt` | Was missing from v34/v35 | None needed |
| 43 | evalPreferences | Added table (`[projectId+sceneId]`) | Pairwise draft ranking (winner/loser) | None needed |
| 44 | sceneDigests | Added table; `&[projectId+subsectionId]` unique, `contentHash` | Derived-artifact layer: one digest per scene, computed at commit time, invalidated by content hash — turns every whole-manuscript pass from O(n) prose re-reads into O(dirty) | None needed (backfill runs via `analysisQueue`) |
| 45 | chapterDigests, volumeDigests, entityStates | Added 3 tables | Hierarchical rollup (scene → chapter → volume) and an entity-state timeline for deterministic contradiction candidates before any LLM call | None needed |
| 46 | analysisQueue | Added table (`[projectId+status]`) | Persistent, idle-priority, resumable work queue for digest backfill and analysis | None needed |
| 47 | entityStates, graphEdges | `entityStates` gains `[projectId+sceneId]`, `[projectId+chapterNumber]`, `[projectId+entityType+entityId]`; `graphEdges` gains `validFromChapter`, `validUntilChapter`, `runId`, `[projectId+validFromChapter]` | The v45 four-part index could not answer "rows for this scene", so per-scene replace always found nothing; edges get a validity window so a relationship reversal is representable instead of deduped away, and `runId` names the run that asserted it | None needed — an edge with no window reads as "always true", the previous meaning |
| 50 | branches | Added `apiId` index | Every other synced table indexed `apiId` in v22; branches (v34/v42) never did, so resolving a fork's `sourceBranchId` on pull threw `KeyPath apiId is not indexed` | None (index-only) |
| 49 | characters, locations, plotThreads, sections, subsections | Entities gain `metadata` (open JSON, unindexed) + `*tags`; sections/subsections gain `pov`, `location`, `*charactersPresent`; subsections gain `wordCount` | Obsidian roadmap Phase 1: a queryable properties backbone and a single write target for scene POV/cast that the digest layer reads back and hydrates but never overwrites. Built as v48 on 2026-08-19 and lost uncommitted; v48 was taken by the perf pass, so the rebuild lands here | None (index-only; `backfillSceneContextV48` hydrates empty scene columns from digests at project open) |
| 48 | snapshots, storyStateSnapshots, sessionArchive | Added `[projectId+chapterId+timestamp]` / `[projectId+timestamp]` | Every autosave read each history table in full and sorted in JS; "latest N" is now a reverse index cursor and writers cap history cheaply (`docs/PERF-AUDIT.md` #1) | None (index-only) |

## Rules

1. **Every version in `SCHEMA_VERSIONS` must have a comment** in `db-schema.ts` documenting what changed.
2. **Every version that modifies an existing table's store string** must have either:
   - An `.upgrade()` handler in `db-migrations.ts` that backfills defaults, or
   - An explicit no-op `.stores({})` handler if the new fields don't require defaults.
3. **The `EXPECTED` map in `dbSchema.test.js`** must be updated for every schema change to lock the final resolved schema.
4. **Migration tests** in `dbMigrations.test.js` must cover every handler in `db-migrations.ts`.
