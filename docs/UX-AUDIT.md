# UX Audit — Versatile

Walked the app as a first-time writer (login → workspace → new project → editor → every panel)
at 1440×900 and 800×600, dark theme, with Ollama running. Findings are grounded in the code;
each one names the file. Status column tracks what has been fixed in this pass.

## Priority

- **P0** — broken or misleading: the writer loses work, hits a dead control, or cannot find a core feature
- **P1** — real friction on the main writing loop
- **P2** — polish

## Findings

| # | Pri | Finding | Where | Status |
|---|-----|---------|-------|--------|
| 1 | P0 | **Polish nav item is dead.** `EditorView` provides `#polish`, but `AppShell` has no `polish` slot since `428ffc81` removed the bottom drawer. Clicking Polish highlights the nav and shows nothing. A dead `showRevise` ref (never set) remains from the same change. | `src/components/layout/AppShell.vue` | fixed |
| 2 | P0 | **Root draft becomes unreachable.** "Start writing" puts text in the project's root document. Once the writer opens a chapter from Sections, that text vanishes from the editor and nothing in the Section Manager leads back to it. The header still counts it ("31 words") while the manager says "Total: 0 words". | `src/components/manuscript/ChapterManager.vue`, `src/components/flow/FlowEditor.vue` | fixed |
| 3 | P0 | Stale `node_modules` (TipTap v2 installed, v3 required) crashed the editor route on first load after pulling. Environmental, but it means `npm install` after pull is a hard requirement — noted in README. | `package.json` | fixed (install) |
| 4 | P1 | **Sidebar overflows at common laptop heights.** 17 panels + 4 system items need ~1,080px; at 900px "Story Shape" is hidden and "Timeline" is half-clipped under the pinned system items, with no scroll affordance. | `src/components/layout/SidebarNav.vue` | fixed |
| 5 | P1 | **No modal focuses its first field.** Shared `Modal` creates its focus trap with `initialFocus: false`; the opener button keeps focus, so typing after "Add Section" goes into the manuscript behind the dialog. Enter in the title field does not submit. | `src/components/shared/Modal.vue`, `ChapterManager.vue` | fixed |
| 6 | P1 | **Genre is stored under two names.** Workspace creates `project.genre`; the store and Project Settings read/write `project.category`. Genre entered at creation never shows in Settings; genre set in Settings never shows in the project list. | `src/services/db-projects.ts`, `src/stores/projectStore.ts`, `ProjectSettingsModal.vue` | fixed |
| 7 | P1 | **Inconsistent vocabulary.** Empty editor says "Create a chapter from the sidebar" — the sidebar item is "Sections". What If says "Open a scene" — the app calls them subsections. Outline is titled "Subsection Outline". | `FlowEditor.vue`, `WhatIfPanel.vue`, `SubsectionOutline.vue` | fixed |
| 8 | P1 | Dead-end or **false** empty states. What If / Voice Lab / Story Shape explained what was missing without pointing anywhere. Worse: Consistency and Beta Reader showed "No issues found — your story reads smoothly" *before any scan*; Beta Reader silently returns when there are no subsections with prose, so a chapter-only writer was told their story reads clean. | `WhatIfPanel.vue`, `VoiceLabPanel.vue`, `StoryShapePanel.vue`, `ConsistencyPanel.vue`, `BetaReaderPanel.vue`, `useBetaReader.ts` | fixed |
| 9 | P2 | Workspace with no history renders the stats section as two bare hairlines around a sentence. | `src/components/workspace/WritingStatsPanel.vue`, `WorkspaceView.vue` | fixed |
| 10 | P2 | Archive shows internal signal names (`session_end`, `[accepted]`) verbatim. | `src/components/layout/ArchiveDrawer.vue` | fixed |
| 11 | P2 | Section row's expanded actions give "Delete" a full-width bar — same visual weight as the primary actions. | `ChapterManager.vue` | fixed |
| 12 | P1 | **Header overflows on phones** (802px of controls in a 375px row; the project name wrapped to three lines) and a full-screen tool panel had no way back to the manuscript except the hamburger + re-tapping the item. Fixed: name truncates, diagnostics/secondary exports/branch/goal-bar hide below `sm`, and a floating "Back to writing" control closes the panel. "Context" and "Clear" remain unexplained jargon on desktop. | `AppShell.vue`, `GoalProgressBar.vue` | fixed (jargon open) |
| 13 | P2 | "Create organization" sits in the workspace header at the same weight as the primary "New" action for a first-time local user. | `WorkspaceView.vue` | open |
| 18 | P1 | Workspace project rows read the root document's count, so a chapters-only project showed "Empty draft". The whole-manuscript total is now written onto the project row on every save. | `projectStore.ts`, `WorkspaceView.vue` | fixed |
| 14 | P2 | Daily goal bar and streak lag the header word count by the 10s save debounce. | `useFlowSave`, `projectStore` | open |
| 15 | P0 | **Progress tracking only counted the root document.** `projectStore.wordCount`, the daily goal, streak, "Saved" mark and the workspace heatmap all hung off `saveDocumentNow`, which runs only for the root document. Writing in chapters — the recommended path — showed "0 words", a goal that never moved, no streak. Fixed: `manuscriptWordCount` (root + sections + subsections) feeds every surface and section/subsection saves call `recordProgress()`. | `projectStore.ts`, `manuscriptStore.ts`, `useFlowSave.ts`, `useAppInitialization.ts` | fixed |
| 16 | P1 | A section's own body was never counted (only subsections), so a chapter with prose but no scenes read "0 words" in the manager and the total. | `useSectionSchemaManager.ts` | fixed |
| 17 | P1 | `stripHtmlTags` removed tags without whitespace, gluing `</p><p>` boundaries ("sky.Ilse") and undercounting every multi-paragraph document. Block tags now become a space; inline marks still don't split words. | `utils/textUtils.ts` | fixed |

## What works well

- The manuscript surface itself: monospace, 66ch, nothing around it. Saving is invisible and confirmed.
- Ctrl+K palette shares its definition with the sidebar, so the two never drift.
- Ollama/model banners distinguish "fixed itself" from "actually broken".
- Workspace project rows (word count · edited ago · sparkline) answer "which one is moving?" at a glance.

## Next pass (not yet done)

- ~~Header jargon on desktop~~ — done: "AI context" with an explanatory tooltip; the safety-check badge is icon-only until something is flagged.
- Workspace header: demote "Create organization" for local users (#13).
- Goal/streak lag behind the header by the 10s debounce (#14).
- ~~Sections/Subsections vs Chapters/Scenes~~ — done: `structureTerms` on the project store; the sidebar, palette and Section Manager read it (a novel says Chapters/Scenes, a screenplay Scenes/Beats). Outline and the editor empty state still say "Sections".
- Section Manager: "Add Section" opens a 4-field dialog; a title-only inline add would match how writers actually start a chapter.
- Generator panel tabs (Ideate / Scene / Chapter / Arc / Blurb) + a second "Prompt type" row is two levels of mode before anything happens.
- ~~Archive "Writing session" spam~~ — done (see docs/PERF-AUDIT.md #1): auto-snapshots no longer file archive rows and are throttled.

## Panel pass (2026-09-14)

The generator panel was the loudest complaint, so this pass gave every tool panel one
grammar and then applied it panel by panel. The grammar, in `src/components/ui/`:

- `BasePanelHeader` — identity left, meta and actions right. The meta yields before the
  title when the row is tight.
- `BaseSection` — title / one-line description / content, separated by hairlines. No cards
  inside panels; a card is reserved for an object the user acts on.
- `.label-micro text-text-hint` — the only eyebrow. 71 files swept; the one survivor is a
  badge, which is a different thing.
- One accent. Success/warning/danger appear as icon tint or a word, never as button fills
  (`VolumeSceneReview` had green/red/yellow full-fill buttons).
- Tailwind 3.4's opacity scale has no `/8`, `/12` or `/35`; those classes produced no CSS at
  all, which is why "soft" buttons and active chips looked washed out. Fixed to `/10`, `/30`.

Panels rewritten against it: Story tools (Ideate / Chapter / Arc setup, plan preview, run
progress, paused, scene review, complete, drift), Consistency, Beta Reader (which also hid
its findings whenever a summary existed), What If (alternatives are a subcomponent with
always-visible actions; the divergence picker is a list), Polish drawer (lenses are filter
chips, annotations are rows, snippets are a list), Story Shape, Timeline, Story Network
header (ten controls in two wrap-safe rows), Costs, Voice Lab, Spark, Archive, Snapshots,
Story Bible. Modal and heading copy is sentence case.

Layout: a docked panel is capped at `calc(100vw - 32rem)` so a 900px Timeline on a 1024px
screen no longer leaves the manuscript five words wide.

Still open: Outline / Canvas / Research internals, the Settings and Voice Upload modals,
and the login view were not touched beyond the eyebrow sweep.

Component tests for the rewritten Consistency, Beta Reader and What If panels landed 2026-09-15
(`consistencyPanel.test.js`, `betaReaderPanel.test.js`, `whatIfPanel.test.js`).

## Functional audit (2026-09-15, Typescript v4)

Walked every panel of the running app with a fresh local session: workspace → new project → editor → all 18 panels,
and one real generation run on `qwen3:8b`. Each finding names the file; the status column is what this pass did.

| # | Pri | Finding | Where | Status |
|---|-----|---------|-------|--------|
| 19 | P0 | **Generated prose was stored twice.** `buildManuscript` copied every scene's HTML into the chapter body (joined with `<hr>`) and set the chapter's `wordCount` to the scene sum; both counters then added body + scenes. A 637-word scene reported a 1,274-word chapter and a 1,313-word manuscript. | `CommitService.buildManuscript`, `useVolumeStoryGenerator.aggregateChapterContent`, `manuscriptStore.structuredWordCount` | fixed: prose lives in the scene rows only; the chapter is marked `generated`; migration v52 clears bodies that exactly equal the join; the editor's chapter row shows "written in scenes" with the scenes as buttons |
| 20 | P0 | **"Generate scene" ran the whole book pipeline.** With an empty scene open, Scene mode planned chapters, built a story spine, created a *new volume and chapter* and wrote there — 5½ minutes, a plan-approval detour, and the scene you were in stayed empty. `singleChapter: … // Keep compatible for now until follow-up task`. | `StoryGeneratorPanel.handleVolumeGenerate` | fixed: Scene mode writes into the open scene (confirming if it has words), or adds a scene to the open chapter, via `writeSceneInto`; the form says what it will do ("Writes into "The harbour" (Chapter 1)"); the pipeline runs only when nothing is open |
| 21 | P1 | **Volumes were named after the prompt.** `title: enhancedSynopsis.slice(0, 60) + '...'` → a volume called "Genre: Literary What this scene / chapter should be about: ...". | `useVolumeStoryGenerator` | fixed: `Volume N`; v52 renames existing prompt-titled volumes |
| 22 | P1 | **Outline and Chapters were two sidebar items over one tree.** Both listed chapters → scenes, both added scenes through the same six-field dialog, both selected scenes; Outline could not add a chapter and said "Add chapters from Chapters in the sidebar". A writer had to learn which door to use. | `navigation.ts`, `SubsectionOutline`, `ChapterManager` | fixed: one panel, two views — Structure (tree, volumes, reorder, edit, history) and Outline (flat, searchable, status-filtered) — via a `BaseSegmented` in the Chapters header; `outline` deep links and palette words still open it |
| 23 | P1 | **A chapter with prose said "Planning".** Filing the loose draft made a 39-word chapter with status `planning`; writing into a scene never moved it either. | `useFlowSave`, `ChapterManager.fileLooseDraftAsSection` | fixed: the first save with words moves `planning` → `drafting`; filing the draft creates it as `drafting` |
| 24 | P1 | **Adding a chapter or scene was a form.** "Add chapter" and "+ Scene" opened dialogs (the scene one has six fields) when a writer has, at most, a title. | `ChapterManager` | fixed: title-only inline rows; Enter adds and keeps the row open, Esc closes; the dialog stays behind Edit |
| 25 | P1 | **Vocabulary drift.** The nav said Chapters; the editor empty state said "open Sections", Beta Reader "split a section into subsections in Sections", What If and Related "from Sections", Outline "+ Add Subsection" and "Sec. 1", delete said "Delete Subsection". | those five components, `useSectionSchemaManager` | fixed: all read `structureTerms`; "1 scenes" plurals fixed in the manager and outline |
| 26 | P1 | **Generator copy broke its own rule.** Stages read "Conjuring Characters & World", "Forging the Story Graph", "Sealing the Arc Contract", "Waiting for the ether…", "[ Abandon Conjuration ]" while the panel pass had settled on plain sentence case. | `GenerationLoadingScreen`, `useVolumeStoryGenerator` | fixed: plain words |
| 27 | P2 | Scene mode did not honour its length: 250 words requested, 637 written. | `useStoryWriter` | fixed: the prompt states a range (85%–130% of the target) instead of "MUST be at least N"; the token cap follows the target (`wordCapTokens`, the old 2,000-token floor never bit); a scene past its range that stops mid-sentence is cut back to its last full sentence (`trimOvershoot`). Verified: 500 requested, 475 written, clean close, 56 s on `qwen3:8b` |
| 28 | P2 | The "+ Scene" action row wrapped at the panel's 350 px ("+" on one line, "Scene" on the next). | `ChapterManager` | fixed: `whitespace-nowrap` |
| 29 | P2 | Workspace "Create organization" still sits beside "New" at equal weight for a local user (#13). | `WorkspaceView` | fixed: organizations are a server feature; a local session is not shown the link at all (a signed-in server user with no organization still gets the quiet ghost link) |
| 30 | P2 | The daily-goal figure recorded while #19 was live (1,313) stays in the history table; it corrects on the next save. | `projectStore.recordProgress` | fixed: schema v53 lowers, in projects the generator wrote into, any daily row above the manuscript's present size to that size; hand-written projects keep every number (a cut is a real fact) |

### Second pass: the analysis panels

Same session, the panels that read the manuscript: Voice Lab, Consistency, Beta Reader, Story Bible, and the routing between them.

| # | Pri | Finding | Where | Status |
|---|-----|---------|-------|--------|
| 31 | P0 | **Voice Lab was dead twice over.** The scan button read `projectStore.currentProject?.id` (no such property; the store has `currentProjectId`) so it was disabled forever; and the list rendered `entry.sectionId.slice(0, 6)`, which throws once ids are numbers, so even seeded rows never drew. The indexer also stored `line.text` / `line.tagType` where the detector emits `dialogueText` / `tag`: every row was blank and untagged. | `VoiceLabPanel`, `useDialogueIndexer` | fixed: the button enables, rows say where a line lives ("The harbour · Counting the boats ¶3"), the stored line has its text, tag and paragraph; speakers are `BaseChip` filters, rows are hairline rows |
| 32 | P0 | **Every dialog and toast rendered twice.** `NotificationHost` was mounted in `App.vue` *and* `EditorView.vue`; one `showConfirm` drew two dialogs (two "Discard" buttons), which read as the guard firing twice. | `EditorView` | fixed: one host, in `App.vue` |
| 33 | P1 | **Findings could not open a scene.** Beta Reader's "Jump to Scene", the timeline's open-scene and now Consistency all send `{ subsectionId }` through the shared navigate ref; the Chapters watcher passed the object straight to `setActiveSection`. Clicking the same finding twice did nothing (a ref that does not change does not notify). | `ChapterManager`, `EditorView` | fixed: the watcher takes a chapter id or `{ subsectionId }`, switches to the Structure view, expands the chapter, selects the scene and scrolls to it; the ref is cleared before it is set |
| 34 | P1 | **Consistency read number words as people.** "Eleven, then ten." produced *Undefined mention: "Eleven"*; the only action for a real undefined name was "Open Section" (title case, wrong word, chapter-level). | `useConsistencyChecker` | fixed: number, ordinal, time, weekday, month and season words are allowlisted; an undefined name offers **Add to bible** (creates the character and rechecks, in the panel) and **Open scene** (project vocabulary); "Open Bible"/"Open Graph" are sentence case |
| 35 | P1 | **Beta Reader read HTML and printed objects.** Scenes went to the model as stored HTML (`<em>Marguerite</em>` in titles), scene numbers started at 0, the summary rendered as raw JSON, categories as `dropped_thread`, pacing rows as "Scene 0: slow", and the digest staleness hash compared HTML to the prose hash so every digest was stale. | `useBetaReader`, `betaReport`, `arcAnalyzer`, `BetaReaderPanel`, `BetaResultItem` | fixed: scenes are stripped with the same block-aware stripper the digest hashes (`stripHtmlBlock`, now in `textUtils`), scene numbers are 1-based, the summary is one line ("1 scene read · 0 contradictions · …"), categories are words, pacing rows carry the scene title, the reader shows "Pass 2 of 4" with a **Stop** that keeps what finished passes found, and labels are sentence case ("Open scene", "Open setup", "Open first use") |
| 36 | P1 | **Opening Beta Reader started the model.** The panel read on mount and its results lived in the panel instance, so every open ran four passes. | `BetaReaderPanel` | fixed: no read on mount; the empty state says what a read is ("Four passes with the local model…") and offers **Read the manuscript** |
| 37 | P1 | **A reload forgot where you were.** The open chapter/scene was not remembered; every reload landed on the root "Start writing" screen while the header still named the scene. | `manuscriptStore` | fixed: the last place is stored per project (`versatile:lastPlace:<id>`) and restored on load when the ids still exist; switching project clears it |
| 38 | P2 | Clicking the open chapter row deselected it and dropped the editor to the root draft; a chapter with words said "Planning"; "1 scenes"; "Its 1 scene hold the prose". | `ChapterManager`, `FlowEditor` | fixed: the row only folds; the pill derives *drafting* from words; plurals |
| 39 | P2 | The Story Bible unsaved-edits guard read "Unsaved Changes / Switch tabs? Your edits will be lost. / Switch", fired for the tab already open, and could stack. | `StoryBiblePanel` | fixed: "Discard edits? / This entry has unsaved changes. Leave the tab and lose them? / Discard"; no-op on the open tab; one dialog at a time |
| 41 | P2 | Opening the bare URL (`/`) as a signed-in writer bounced to the login page, and the login page was reachable while signed in. | `router` | fixed: `/` and unknown paths go to the workspace; the guard sends a signed-out visitor to login and a signed-in one away from it |
| 40 | P2 | Type voice and prop types: the confirm heading and the Archive header were `text-lg font-ui` / `font-semibold text-sm`; `EntityActionButtons.editingId`, `PolishAnalysisArea.projectId`, `DraftComparator.sceneId`, `EvalTrends.projectId`, `WhatIfTimeline.selected*Id` were typed `String` and warned on every numeric id; `TraitSuggestionsPopover` never imported `TagInput` / `BaseIcon`. | those files | fixed: `.type-display`, `[String, Number]`, imports |

### Third pass: the whole-book generation path (2026-09-15)

Run, not read: a Chapter-mode run (1 chapter × 2 scenes × 1,000 words), an Arc run (3 chapters × 2 scenes × 800 words,
one click) and a Chapter run stopped mid-write, all on `qwen3:8b`. Timings: the chapter run took 5.7 min (2 min planning,
1.3 min writing, plan approval in between); the arc run 16.5 min, of which the continuity fix rounds took 7 — more than
the writing. Scenes landed within 3–10 % of their targets.

| # | Pri | Finding | Where | Status |
|---|-----|---------|-------|--------|
| 42 | P0 | **Chapter mode rejected its own plan.** The form allows 2 scenes per chapter; after two minutes of planning the run died with "Director returned insufficient scenes (need at least 3)". | `useVolumeStoryGenerator` | fixed: the floor is the plan (at most 3); the message names both numbers |
| 43 | P1 | **Two progress lists in one panel.** `GenerationStages` (Preparing story elements → Saving) sat above `GenerationLoadingScreen` (Setting up the volume → Fixing the arc) — different steps, different words, 18 px labels in a 350 px panel. | `GenerationLoadingScreen`, `GenerationRunView` | fixed: one stage list; the lower block only shows what is arriving (cast and places, then planned scenes) and the Stop |
| 44 | P1 | **A failed or stopped plan left an empty volume**, and two runs were both called "Volume 1" (the store had not loaded the project's volumes when the name was chosen). | `useVolumeStoryGenerator` | fixed: `dropEmptyRunVolume` on the planning catch (only when no chapter owns it); the name counts the volumes in the database and skips taken names |
| 45 | P1 | **The planner reused written scene titles.** A second run's first chapter was planned as "The Torn Ledger" / "A Warning at Dusk" — the exact scenes already written — because the evidence listed them as `"title": <p>excerpt` with no word that they were done. | `useVolumeStoryGenerator.buildEvidence` | fixed: plain-text excerpts prefixed with the chapter, under a heading that says the plan continues after them; a planned title that still repeats a written one is renamed and counted on the run-health ledger |
| 46 | P1 | **Markdown emphasis reached the manuscript as asterisks** (`*Vespera*`, `**no**`). | `liveDraft.proseToHtml` | fixed: `*x*` / `_x_` → `<em>`, `**x**` → `<strong>`, on escaped text; `* * *` and `snake_case` untouched |
| 47 | P1 | **The continuity fix rounds were a black box.** "Resolving 3 continuity issue(s) (pass 1)..." stood for seven minutes while the model rewrote whole scenes, with no per-scene progress and no button at all. | `ConsistencyService`, `GenerationRunView` | fixed: "Rewriting scene 5 for continuity — 2 of 3, pass 1 of 2", "Rechecking…", and **Keep the prose as written**, which lets the rewrite in flight finish and skips the rest |
| 48 | P1 | **Stop left no trace.** Stopping mid-write returned the panel to the blank form; the resume card never appeared because the scene still in flight committed *after* the reset and wrote a checkpoint with `writtenCount: 1` and an empty plan, which nothing can resume. The Chapter tab also had no "Continue this story" card at all. | `CommitService.persistCheckpoint`, `useGenerationRunController.reset`, `StoryGeneratorPanel` | fixed: a checkpoint is never written against an empty plan; reset re-reads the resumable run; the Chapter tab carries the continue card |
| 49 | P2 | **History.** "Previous generations" still said *Finished runs are listed here* after a run (read once at mount); a run was titled "Volume Story — 9/15/2026"; a run with issues showed "score -4". | `useVolumeStoryGenerator`, `StoryGeneratorPanel`, `PreviousGenerationsList` | fixed: the generator bumps `historyVersion` after the row is written and the panel re-reads; runs are named after their chapters ("The Count … The Truth (3 chapters)"); a negative score reads "4 continuity issues" |
| 50 | P2 | **Copy and counters.** Stage strings still in the old voice ("Weaving the Story Network (relationships)...", "Forging the Story Graph (Planning scenes)...", "Sealing the Arc Contract...", "Phase 1: Generating chapter anchors in parallel..."); "Generate Chapter", "Chapter Word Target", "Conjuration Failed"; "3 scene(s)" everywhere; the stage line said "Scene 4 of 6" while the block under it said "Scene 5 of 6"; while the plan waited for approval the status still read "Settling the arc…"; the Chapters pill showed the raw key `generated`; the gate's payoff advisory read like a log line; "1 are stubs" and an enabled "Continue drafting (0 scenes)". | those files, `useChapterI18n` (`{count\|one\|many}` plural slot), `config/statuses` | fixed |
| 51 | P2 | The continuity fix rounds cost more than the writing on a local model (7 min against 5.5) and rewrite scenes the writer has already seen land. They are only in one-click mode, and #47 gives a way out, but whether they should be opt-in like "Critique each scene" is a product call. | `ConsistencyService` | open — decision needed |
| 52 | P2 | The live draft follows the writer across chapters as scenes land, which also moves a writer who was editing elsewhere. | `liveDraft.focusSubsection` | open — follow only while the writer has not moved |

### Fourth pass: the data panels on a real book (2026-09-15)

The book from the third pass (3 volumes, 5 chapters, 10 scenes, 3,722 words) opened in every panel that reads the
manuscript. Network, Canvas (board and map), Polish, Research, Costs, What If and Related all rendered and said something
true; the findings are where a panel read the wrong thing.

| # | Pri | Finding | Where | Status |
|---|-----|---------|-------|--------|
| 53 | P0 | **The header's two export buttons exported the wrong thing.** "Export manuscript (RTF — opens in Word, Docs, Scrivener)" wrote the loose root document only — for a book written in scenes, a title page and a word count. "Export to PDF" wrote an outline (bible tables, chapter and scene titles) with no prose. The real export — Compile: narrative order, Markdown, Word, EPUB — was reachable only from the Ctrl+K palette. | `AppShell`, `exportService`, `compileManuscript`, `CompileManuscript` | fixed: one header button opens Compile; Compile gains PDF and RTF built from the compiled manuscript; the palette's RTF action compiles too; the outline PDF is named for what it is |
| 54 | P0 | **Chapter digests collided across volumes.** A scene digest carries the chapter number its run gave it, which starts at 1 in every run; the rollup keyed chapter digests by it, so three volumes' first chapters became one "chapter 1" and the timeline showed three chapters, one of them stitched from three. A rollup also only ever ran at the end of a generation run. | `digestContext.rollupProjectDigests`, `useAppInitialization` | fixed: digests are placed by the section their scene sits in, numbered in manuscript order; the rollup also runs after the background scene-digest backfill |
| 55 | P1 | **Section order interleaved volumes.** `order` restarts at 0 in every volume, and `sortedSections` sorted on it alone — the timeline, the outline, the shape analysis and the export read the third run's first chapter as chapter 3. Compile compared volume ids as strings. | `manuscriptStore`, `manuscriptShape`, `digestContext`, `compileManuscript` | fixed: one `orderSections` (volume by volume, then order, then id) used by all of them; numeric id comparison |
| 56 | P1 | **Story Shape analysed the empty root document.** Reanalyze read `projectStore.documentContent` (empty for a book in scenes) and returned silently; the panel showed whatever the last generation run had stored, and with two records at the same version it showed the older. Dialogue was always 0% ("narration-heavy") because the ratio counted lines that *began* with a quote after every paragraph had been collapsed onto one line. | `useStoryShapeAnalyzer`, `useHeuristicAnalyzer`, `StoryShapePanel` | fixed: Reanalyze reads the whole manuscript; `hasManuscript` disables the button and words the empty state honestly; latest record by version then id; dialogue is the share of words inside straight or curly quotes (8% on this book) |
| 57 | P2 | Timeline chapter summaries were scene summaries joined with " \| ", with repeats. | `digestRollup` | fixed: sentences, once each |
| 58 | P2 | Canvas element types said "Section" and "Plot Point"; Story Shape said "Dialogue Ratio" and "Narration-Heavy". | `StoryCanvas`, `StoryShapePanel` | fixed: project vocabulary, sentence case |
| 59 | P2 | **The writer reuses its own images across scenes.** Related ranks three scene openings at 89 % similar; "cold wind biting into her skin like an old wound" opens three of ten scenes. Repetition is checked within a scene, not across the book, at write time. | `useStoryWriter`, `repetitionDetector` | open — the previous scenes' opening sentences could go into the brief as "do not reuse", or the intra-scene detector could run over the last N openings |

### Fifth pass: the first run (2026-09-15)

A fresh local writer, empty database: login → workspace → first project → first scene.

| # | Pri | Finding | Where | Status |
|---|-----|---------|-------|--------|
| 60 | P1 | **The workspace's first run was a form and a chart of nothing.** "Pick up where you left off" to someone who has never been here; a writing-stats panel saying it had nothing to say; the only door a blank project. | `WorkspaceView` | fixed: the subtitle knows it is a first run; stats appear once a project exists; **Open the sample story** seeds *The Long Night (sample)* — two chapters, four scenes of real prose, three characters, two places, one thread — so every panel has something true to show; a normal project once created (`seedSampleStory`, idempotent per user, no model calls) |
| 61 | P1 | **A book whose words are all in scenes opened on "Start writing".** With no remembered place (the sample, an import, a first open) the editor showed the empty root document while the header counted 459 words. | `manuscriptStore.restoreLastPlace` | fixed: lands on the first scene with prose, in manuscript order |
| 62 | P2 | A blank project's editor offered only the blank page; the generator's "No synopsis set — open Project Settings" was a sentence, not a way there. | `FlowEditor`, `GenerationSettingsForm`, `StoryGeneratorPanel`, `EmptyState` | fixed: **Or draft a scene with the generator** under *Start writing* opens the generator on its Scene tab (`initialTab`); the synopsis hint links to project settings; `EmptyState` gains an `#after` slot for a quieter second door |
| 63 | P2 | The onboarding wizard (`WelcomeOnboarding`: name, description, first character) only appears when the editor opens with *no project*, and the workspace always creates one first — so no writer reaches it. | `useAppInitialization`, `EditorView` | open — either retire it or make it the New-project dialog's long form; a product call |

### Sixth pass: backend and sync (2026-09-15)

| # | Pri | Finding | Where | Status |
|---|-----|---------|-------|--------|
| 64 | P2 | `docs/sync-status.md` listed a server-only `Research` (ResearchNotes) entity that the `RemoveResearchNotes` migration had already dropped; the rest of the doc — 14 synced, 16 local-only, 21 client-only — matches `SYNC_ENTITIES` and the `DbSet`s. | `docs/sync-status.md` | fixed: the doc says what the code says, and records what was checked |
| 65 | P2 | The API was never booted in this audit until now: against an empty Postgres 16 it applies its two migrations and reports `/health` healthy (`database`, `ai_provider`); Swagger serves. Not exercised: a two-client sync run, which needs a server account created through the editor's sign-in. | `backend/` | verified as far as it goes; the sync run is the user's to do with `docker compose up` |

What works, and was left alone: the Chapters panel's "Loose draft — File as chapter" (one click, no dialog), Consistency and Beta Reader
empty states now say what they need, Polish docks under the manuscript as a drawer (it looked dead only because it sits below a short
viewport), Settings is a modal, Costs/Research/Archive/Network/Timeline/Story Shape all open with honest empty states.
