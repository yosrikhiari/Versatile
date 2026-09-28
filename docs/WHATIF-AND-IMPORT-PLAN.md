# What If on any novel: import, understand, branch

Plan v1, 2026-09-27. Status: approved to start (build order step 1 onward).

> **Built.** Steps 1–4 are done and measured (analysis doc §37–§43). How it
> works now, with diagrams: `ARCHITECTURE.md`, "Imported books and What If".
>
> ![Fork, plan, write, merge](img/diagrams/whatif-branch-flow.svg)

## 0. In one sentence

Let an author bring in a novel they already have (a .txt, .md, .docx or .epub),
have Versatile read it once and build the same story knowledge a generated book
has, then ask "what if X had happened in chapter 7?" and get a branch where
everything before chapter 7 is untouched and everything after is rewritten
where the change reaches, and kept where it does not. The author can review
the branch scene by scene and merge it back.

## 1. Done means (acceptance gates)

Each gate is measured, not asserted. Numbers go in
`docs/GENERATION-PIPELINE-ANALYSIS.md` and the report.

| # | Gate | How it is measured |
|---|---|---|
| G1 | **Import keeps every word.** Body words in = body words stored, ±0.5% (front matter excluded and reported). | Unit test per fixture; the 6 Gutenberg books in `reports/live/masterpieces/raw/` |
| G2 | **Import finds the structure.** Chapter count matches the book's own table of contents on at least 5 of the 6 Gutenberg books with no manual edit, and on all 6 after at most two edits in the preview. | Fixture test with hand-written expected counts |
| G3 | **Imported rows are whole.** Every chapter and scene has a `branchId` (the main branch), a 1-based global `sceneNumber`, `order`, `wordCount` and HTML `content`. Nothing is orphaned. | Unit test on the created rows (fake-indexeddb) |
| G4 | **The book is understood.** After the analysis pass, 100% of scenes have a non-empty summary, key facts and cast. The story bible contains at least 8 of the 10 most-mentioned named characters of each Gutenberg book (a hand-made list). It has no duplicate people ("Holmes" / "Sherlock Holmes" are one character). | Live run on 2 books, list checked by hand |
| G5 | **Imported and generated books look the same downstream.** Retrieval, continuity checks, the beta reader and the story network run on an imported book without "no data" states. | A test that builds both kinds of project and diffs the fields each feature reads |
| G6 | **The fork is exact.** A what-if branch at scene *k* has scenes 1..*k*−1 byte-identical to the source, and every branch scene knows which source scene it came from. | Unit test |
| G7 | **The change actually happens and sticks.** On 3 live what-ifs (one per imported book type), the branch states the change at the divergence scene, and no later scene contradicts it. That is checked by the continuity gate plus my own reading, with the result reported honestly. | Live run |
| G8 | **Merge works and can be undone.** Accepting a branch (whole, or chosen scenes) updates the source scenes it came from and takes a snapshot first. Deleting a branch removes its rows. | Unit test |
| G9 | **Nothing regresses.** Full suite, typecheck, lint, policy, format all clean. | CI commands |

## 2. What exists today (27 Sep audit)

### Import: there is no novel importer
- "Import" means only a Versatile JSON backup (`useExportImport.ts`, `db-export.ts`).
  That path has real bugs:
  - **It does not remap ids.** Every row gets a new id, but `subsections.sectionId`,
    `sections.volumeId`, relationships, graph edges, volume entities and `branchId`
    keep the old ones, so scenes end up orphaned from their chapters.
  - **Branches are not exported at all.**
  - **Sync fields (`apiId`, `syncStatus`) are copied**, so the copy collides with the
    original on the server.
  - **The only test re-implements the function** instead of calling it.
- The recovery backup (`dbRecovery.ts`) **leaves out chapters and scenes**. Restoring
  it wipes the database first, so a restore loses all prose.
- `.docx` and `.epub` are unsupported anywhere. The research library takes
  .pdf/.txt/.md/.html, but into research, not the manuscript. `jszip` is
  already a dependency, which is all .docx and .epub need.

### Understanding: a hand-written or imported book gets almost nothing
- **Digest backfill runs on load but makes no model call.** Summary empty,
  `keyFacts` empty, `chapterNumber` null, `metadataStatus: 'skipped'`. The
  author's own summary is dropped too, because it is never enqueued.
- **Nothing extracts characters, places or relationships from prose.** `detectEntities`
  is dead code. The research extractor reads only the first 12,000 characters.
- **storyArc and spine live only inside a generation run**, so an imported book has none.
- **The vector index is not built on import** (`bulkAdd` bypasses it), and each item is
  cut to 6,000 characters.
- **"Refresh voice from manuscript" is broken for every project.** `getFullText()` reads a
  field that only a Storybook story sets.
- **The beta reader trusts empty digests** (it does not check `metadataStatus`), so its
  fact ledger stays empty on these books.

### What If: two modes, both partly broken
- **Alternatives** (3–4 versions of one scene) has four problems:
  - It reads `sub.brief`, a field that does not exist (the brief is in `description`).
  - Its "what happened before" list is every scene title in the book, in
    unsorted order, future scenes included.
  - The premise box only shows in the other mode.
  - Replace writes plain text into an HTML field, with no confirmation or snapshot.
- **Branch** ("rewrite the rest") is broken in several ways:
  - **It ignores the chosen scene** and blanks and rewrites the whole book.
  - **It copies only the rows tagged with the active branch id**, so older, blueprint
    and imported rows are skipped. It then reports "Done" with 0 scenes written.
  - **Its canon is the whole-book story documents**, which include the future it
    is supposed to change.
  - **It writes with a bare one-shot prompt**, not the writer and the gate.
  - **It has no cancel.**
  - **Switching to the new branch does not reload anything**, and the next load
    mixes all branches together.
  - **Accept matches scenes by the wrong chapter id**, so it copies nothing back.
  - **The accept and delete list is never mounted**, so a user cannot reach it.
  - **Deleting a branch through the normal branch manager leaves its rows orphaned.**
- **Branches do not sync correctly.** The server has no branch endpoint, and chapters
  and scenes sync without `branchId`, so a branch's copies would arrive as duplicate
  chapters.

### What we can reuse
- **`continuation/plan.ts` + `writeScenesInto`** ("continue drafting"). This writes
  planned-but-empty scenes one by one through `writeSceneWithGate` (the real
  writer, the gate, repair-in-place), using the prose before each scene as
  context. It works without a stored plan. This is the engine for writing a branch.
- **Scene digests, `deriveEntityStates`, chapter rollups, and `getStoryDocumentContext(projectId, {atChapter})`.**
  The knowledge layer exists; it only needs feeding.
- **The critic's continuity check** (claims + probability confirmers, §33–35), to
  check kept scenes against the new facts.
- **`wordDiff`, `snapshots`, `BranchSwitcher`, `branchStore`.**

## 3. Decisions (locked unless you say otherwise)

1. **No new dependencies.** .docx and .epub are zip files of XML/XHTML: parse them with
   `jszip` and the browser's `DOMParser`. .txt/.md are decoded with `TextDecoder`
   (UTF-8 strict, then UTF-16 by BOM, then windows-1252 as the fallback).
2. **Import always shows a preview before writing anything.** The detected parts,
   chapters and scenes are shown as a tree the author can fix (merge, split,
   rename, mark as front matter). The Gutenberg books show why: *Ethan Frome* has
   an epitaph in capitals that looks like a heading, and *Sherlock Holmes* has
   stories with numbered parts inside them.
3. **The author's structure wins.** Parts become volumes, chapters become chapters, and
   scene breaks (`***`, `* * *`, `#`, `~`, a lone centred glyph) become scenes. A chapter
   with no breaks stays one scene; the analysis pass reads long scenes in chunks.
   We do not invent scene splits.
4. **The main branch is created before any row**, and every imported or restored row
   carries its id. Existing rows with no `branchId` are backfilled to their project's
   main branch in a schema migration. That fixes both the fork's "0 scenes" and the
   mixed-branch load.
5. **Understanding runs once, in the background, on the local model, and can resume.**
   The author sees an estimate first ("~100 scenes, about 40 minutes on your GPU").
   Each scene's result is cached by content hash, so a cancelled or crashed pass
   continues where it stopped, and editing one scene re-analyses only that scene.
   Groq is used only if the author configured a personal key.
6. **Imported books get the same records as generated ones**, written through the
   same functions: digests with `metadataStatus: 'ok'`, key facts, cast, location,
   POV, the chapter number, entity states, the story bible, graph edges, and a
   story profile (genre, tone, central conflict, premise) in place of `storyArc`. A
   small `getStoryArc(projectId)` returns the run's arc or the stored profile, so every
   reader stops depending on a generation run existing.
7. **A what-if is three steps the author can see: plan, write, merge.**
   - **Plan:** the model reads the change, the story as it stood at the divergence
     (summaries and facts of the earlier scenes only), and a one-line summary of each
     later scene. For each later scene it proposes *keep*, *revise* (with a new brief)
     or *drop*, plus any new scenes. The author edits this plan before anything is
     written. That doubles as the cost check.
   - **Write:** *revise* scenes go through `writeScenesInto` on the branch. The canon is
     the story up to the divergence, plus the change stated as a fact. Nothing after
     the divergence is canon.
   - **Keep:** kept scenes are copied, then checked by the continuity check against the
     new facts. A kept scene that now contradicts the change is repaired in place.
   - **Merge:** compare side by side; accept all or chosen scenes. A snapshot is taken first.
8. **The fork copies the whole book, prose included.** Every branch row records
   `sourceSubsectionId` / `sourceSectionId` (a schema bump). Merge and compare match
   on those, never on titles.
9. **Story knowledge becomes branch-aware.** Scene digests and entity states are
   keyed by scene id, so each branch already has its own. Chapter digests are
   keyed by project + chapter number, so a branch's chapter 5 would overwrite
   main's. They get the branch in their key in step 4, before any branch is
   analysed.
10. **What-if branches stay local for now.** Non-main branch rows are excluded from sync
   until the server has a branch endpoint and `branchId` on chapters and scenes. This is
   in the backlog, not silently broken.
11. **Alternatives mode stays and gets fixed**, not replaced: the right brief field,
    "before this scene" meaning before, a premise box, HTML with a snapshot on Replace.

## 4. Build order

Each step ends with tests green and a local commit. The report and analysis doc
are updated as steps land.

1. **Foundations: data integrity bugs, fixed first because they lose or hide data.**
   *Done 27 Sep:* branch adoption on open (one shared load, the right project's
   branch), fork copies the book with source links, delete cleans its rows,
   switch reloads, recovery covers every table and never clears what a backup
   lacks, JSON import remaps every reference and strips sync identity, voice
   extraction reads the scenes. 11 tests over the real schema.
   Also found: a plain "new branch" was an empty row (switching to it showed an
   empty book), and the branch store kept the previous project's branch.
   - Branch backfill migration, the init race, and `loadManuscript` with no branch id.
   - Branch delete removes its rows. Switching branch refreshes the list and reloads the manuscript.
   - The recovery backup includes chapters and scenes.
   - The JSON import remaps every id, exports and imports branches, and strips sync
     fields. It gets a real test that calls `importProject`.
   - Fix `getFullText` (voice extraction).
2. **Novel importer.** *Done 27 Sep:* all six Gutenberg books import with the
   right chapter count, first and last title (contents page for five, Roman
   numerals + the frame story as a prologue for Ethan Frome), every word
   accounted for (scenes + front/back matter + headings = total, exactly),
   Holmes' numbered parts as scenes. docx/epub/md/html/txt, UTF-8/16/1252.
   Reached from the projects page, the project menu and Ctrl+K. Checked in the
   running app on Ethan Frome and Dubliners. Found on the way: a chapter row
   carrying its scenes' word count doubles every counter (fixed before commit),
   and step 1's branch store queried numeric project ids as strings (fixed).
   Original description: `src/services/import/` holds decoders (txt/md/docx/epub/html) that
   produce `{ blocks }` (heading level, paragraph, break), plus a structure detector
   (headings, numerals, `Chapter N`, parts, prologue/epilogue, front and back matter,
   Gutenberg boilerplate), plus the row writer. `ImportNovelModal.vue` does the preview
   and edits with the `Base*` primitives. It is reached from the project list
   ("Import a novel") and Ctrl+K. Fixture tests on the 6 Gutenberg books and small
   hand-made .docx/.epub/.md files cover G1–G3.
3. **The understanding pass.** *Done 27 Sep, measured live on Ethan Frome
   (34,787 words, 12 scenes, qwen3:8b on the RTX 4060, Jester paused):
   10.8 min end to end after the fixes below (about 16 before). 7 characters
   with the right roles and aliases, 21 places, 15 chapter-stamped links
   ("Ethan Frome married to Zeena Frome" from ch. 1, never closed; "in love
   with Mattie" ch. 2-9 then "formerly close to" at ch. 10), 12 `ok` digests,
   an accurate story profile. The first live read found eight defects, all
   fixed with tests: ids stringified (two digests per scene), two concurrent
   runs linking twice (atomic claims + a Web Lock per book), bracketed notes in
   names ("Zeena (his wife)"), "Ned" merged into "Mrs. Ned Hale", unmerged and
   generic places (37 -> 21), one-scene family misreadings and a
   twice-misread marriage (vote + marriage exclusivity), relation wording
   churn (a small type vocabulary + one relationship per pair over the book),
   a link to a person not yet in the bible dropped silently, and every
   background call waiting out its own 30 s foreground linger (a `background`
   option on aiService: -30% time). Built as:*
   `useBookAnalysis` on the existing durable `analysisQueue` (claims now
   filtered by task type, so the open-project digest backfill can no longer
   take and fail these jobs; completed jobs keep their result, so a stopped
   read resumes). Stage 1 reads each scene (passages of <= 2,500 words) into
   summary / pov / location / cast / places / key facts / relationships.
   Stage 2 resolves names across the book by rule (the one full name that
   contains a short form; "Frome" in two full names is left for the model's
   probability over the candidates, merged only above 0.6). Stage 3, chapter
   by chapter, feeds each scene as the writer's own structured record through
   `syncChapterToBible` (bible entities, graph nodes, chapter-stamped edges)
   and `writeSceneAnalysis` (ok digests + entity states), then the rollup,
   a story profile, the voice profile and the search index. A person named in
   one scene only is cast, not a bible entry. Banner offers it on imported
   books; Ctrl+K "Understand this book" for any book. Integration test on
   the real schema/stores (mock model), mutation-checked.

   **Decision: no message broker (RabbitMQ/Kafka) for this.** Considered at
   the user's suggestion. The work runs in the browser against a local GPU
   that serves one request at a time by design (providerGate); a broker adds
   a server hop and a mandatory backend to an offline-first feature without
   adding throughput. What the job needs -- durability, resume, retry,
   failed items, ordering, stages -- the IndexedDB queue already provides.
   Revisit when analysis moves server-side (many users, a GPU worker pool):
   then Redis Streams or MassTransit on RabbitMQ next to the existing
   Postgres outbox, Kafka only at event-stream scale.

   Original description: `useBookAnalysis` is a resumable queue. Per scene it
   produces summary, key facts, cast, location, POV and time markers (chunked for
   long scenes). After that, book-level work runs:
   - character and place resolution with aliases into the story bible;
   - relationships into `graphEdges`, with the chapter they start;
   - entity states and chapter and volume digests;
   - the story profile and story documents;
   - the voice profile;
   - the vector index, chunked instead of cut at 6,000 characters.

   It also runs for hand-written projects, from a "Analyse the book" button. The beta
   reader stops trusting skipped digests. Covers G4–G5.
4. **What-if branch, rebuilt.** *Done 27 Sep, tried live on Ethan Frome
   ("What if Zeena never goes to Bettsbridge?", diverging at ch. IV): scenes
   before the change byte-identical (G6); plan in ~50 s; 6 scenes rewritten
   (~23k words) in 54 min with Jester sharing the GPU; the change carried in
   IV-VII and IX, but VIII still said "after Zeena left" and the kept epilogue
   still told of the sled crash -- so every scene after the change is now read
   and checked, in order, against the change and the rewritten scenes' facts
   ("Check again" re-runs it). The planner took three live attempts: one call
   for all scenes (dropped everything), a one-letter answer per scene (p=1.00
   keep for all, no room to reason), then reason-first per scene with briefs
   that see only their own scene (a view of earlier briefs made every brief a
   copy of the first). See analysis doc §37.* *After the live run (§38-§39): the stated change keeps the author's premise;
   a who-is-where check follows each person the change names through the later
   scenes and flags a missing event for review (someone treated as gone, or shown coming
   back, when no scene showed them leave). A fact check cannot see those.
   A flagged scene can be written again with the missing event as a rule in
   its brief ("Rewrite this scene", §40), with undo.* Originally: Fork at the scene with source links, then plan,
   write/keep/repair, then compare and merge, with cancel and pause. The branch list
   is mounted in the panel; the stale store/job code is removed or wired up. Covers G6, G8.
5. **Alternatives mode fixes** (decision 11).
6. **Live validation.** Import 2 Gutenberg books, analyse them, run 3 what-ifs; report
   G4 and G7 honestly. Update the docs (`README`, `ARCHITECTURE`, `CHANGELOG`,
   `UX-AUDIT`, this plan) and the report.

## 5. Decided vs open

**Decided:** everything in §3.

**Open (defaults chosen, tell me if you disagree):**
- **Default what-if scope:** "rewrite only affected scenes" (the plan step decides),
  not "rewrite everything after". Rewriting everything is still available in the plan
  by marking all scenes *revise*.
- **Analysis model:** the local `qwen3:8b` utility model. A book of ~100k words is about
  100 scenes, so roughly 30–60 minutes the first time; later edits cost one scene each.

## 6. Backlog (not in this plan)
- Server-side branches and branch-aware sync (decision 10).
- PDF manuscripts (text extraction exists in research; the layout makes chapter
  detection unreliable, so the PDF comes second).
- Per-character "what if" (the same change seen from another POV).
- A stronger within-scene contradiction checker (§35/§36: blocked on a Groq key or a
  larger local model).
- Keep the history of generated alternatives instead of holding them only in memory.
