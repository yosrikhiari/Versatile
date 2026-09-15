# Performance & Code-Quality Audit — Versatile

Read the hot paths end-to-end (per keystroke, per autosave, per project open, on timers) and
the data layer under them, rather than pattern-matching for loops. Every finding names the
file; "after" states what shipped. Complexity is stated in terms that matter here:
**S** = saves ever made, **D** = document size, **N** = rows pending sync.

## Critical

| # | Finding | Before | After | Status |
|---|---------|--------|-------|--------|
| 1 | **Every autosave appended three permanent rows and re-read all of them.** `useFlowSave.performSave` → `snapshotStore.saveNewSnapshot` wrote a full-content snapshot then reloaded every snapshot for the chapter; `recordProgress` → `autoSnapshot` → `saveEndOfSessionState` wrote a state snapshot **and** a `session_end` archive row, then two full-table reads. No dedup, no cap. | O(S) reads and O(D) storage per save; a day on one chapter ≈ 9 MB read back *per save*, DB +30 KB per pause forever. | Content snapshots dedup against the newest and cap at 40/chapter; state snapshots throttled to one per 5 min, skipped when unchanged, capped at 50/project, no archive row (that's for real session ends); no post-write reloads — the open drawer refreshes itself. Reads are O(limit) over `[projectId+timestamp]` / `[projectId+chapterId+timestamp]` (schema v48). | fixed |

Also fixes the UX finding "Archive shows a new Writing session every few minutes".

## High

| # | Finding | Before | After | Status |
|---|---------|--------|-------|--------|
| 2 | **Editor open gated on two Ollama round-trips.** `initializeApp` awaited `checkOllamaConnection` (5 s timeout) then `checkModelAvailability` (no timeout, second `/api/tags`) before `loadProject`. | Manuscript waits on the network; hangs if the endpoint black-holes. | One probe with a 5 s timeout, started first and awaited last; the project loads from IndexedDB in parallel. | fixed |
| 3 | **Root-document typing serialised the whole document twice per keystroke.** `onUpdate` called `getHTML()` to push into the store; the `activeContent` watcher called it again to discover the change was its own. | 2 × O(D) per key. | Store push debounced 300 ms; watcher skips the editor's own echo; saves hand the live text to the store first so nothing inside the window is written stale. | fixed |
| 4 | **Project open ran ~8 independent IndexedDB reads serially** in `loadProjectData`, against the repo's own rule. | 8 sequential round trips. | `Promise.all`; latest state snapshot taken from the (newest-first) history instead of a ninth read. | fixed |

## Medium

| # | Finding | Before | After | Status |
|---|---------|--------|-------|--------|
| 5 | Archive queries (`getSessionArchive`, `getLatestStateSnapshot`, `getStateSnapshotHistory`) read the project's whole history then filter/sort/slice in JS. | O(rows). | Reverse index cursor that stops at `limit`; `before` becomes an index bound. | fixed |
| 6 | Sync pushed one HTTP request per pending row, sequentially. | N serial requests per 30 s flush. | Bounded concurrency (4) per table; `branches` stays serial (self-referencing). | fixed |
| 7 | `[DEBUG]` logs capturing `new Error().stack` on every project open (`branchStore`, `db-branches`, a deep sync watcher in `BranchSwitcher`). | Noise + stack capture per call. | Removed. | fixed |
| 8 | Five ad-hoc `replace(/<[^>]*>/g, …)` strippers beside the shared `stripHtmlTags` — and the shared one was the buggy one until the UX pass fixed it. | Drift. | All on `stripHtmlTags`. | fixed |
| 9 | `getSectionWordCount` did `sections.find` per rendered row (introduced in the UX pass). | O(n²) list render, n ≤ ~100. | `sectionsById` map. | fixed |

## Left alone, on purpose

- Nested `.find`/`.filter` over scenes in the generation pipeline (`useVolumeStoryGenerator`,
  `useStoryDirector`, `deterministicContradictions`): n ≤ ~100 and each iteration sits beside an
  LLM call measured in seconds. Optimising it would be invisible.
- `StoryNetwork` entity lookups O(nodes × entities): hundreds × hundreds, event-driven rebuilds.
- `AutoDialogue` re-scans the document per transaction: linear, tiny constant. Range-limiting it is
  possible if a 100k-word root document ever shows lag.
- Retrieval: the IVF vector index and chunk cache are already the right shape.
- Whole-manuscript-in-memory (`loadManuscript` loads every subsection's prose): fine at 10×; at
  100× (multi-million words) consider loading bodies lazily per section.

## Noticed, not fixed (separate decisions)

- `sync-mapper.ts` declares `idBridge.needsTranslation` on several tables but nothing consumes it.
  `sectionId` and `volumeId` are translated anyway inside each `toApi` (`lookupApiId`), but
  `branches.sourceBranchId` and `volumeEntities.entityId` were sent to the server as **local**
  ids — fixed 2026-09-15 (translated both ways; `branches` gained the missing `apiId` index in
  schema v50). `planning/AUDIT-2026-09-15.md` B1.
- 164 ESLint warnings, 134 of them unused variables — dead code worth a sweep.
- ~~Three files over 2,000 lines~~ — two of the three were split in the pipeline pass
  (`useVolumeStoryGenerator` 4,006 → 2,795 with the write strategies in
  `generation/writing/`; `StoryGeneratorPanel` 2,268 → 932 behind
  `GenerationRunView`). `StoryNetwork` (2,407) remains; split when next touched.

## Verification

- 2,718 unit tests pass (15 added: history-table bounds against real Dexie, non-blocking probe,
  root-save ordering, push concurrency, schema v48).
- `tsc --noEmit` and `vite build` clean.
- In the browser: three changed saves → 3 content snapshots, 1 state snapshot, 0 archive rows
  (previously 3 / 3 / 3); root-document typing updates the count within the idle gap and survives
  reload; Archive lists only pre-existing sessions.
