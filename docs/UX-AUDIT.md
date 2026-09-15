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
