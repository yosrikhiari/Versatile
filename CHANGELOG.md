# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries cover work
done after `v1.0`; each references the commit whose message records how it
was verified.

## [Unreleased]

### Design system v4, Typescript (2026-09-15)
- An audit of the running app (both themes) found the system disciplined but
  flat: nothing was figure and nothing was ground; the accent did nothing but
  colour two buttons; every empty state was the same template. Three
  directions were mocked up on the same four screens (`docs/DESIGN-DIRECTIONS.html`);
  **C, Typescript** was chosen.
- Tokens (`src/style.css`): bone paper by default, charcoal under
  `[data-theme='dark']` (the default theme flips to light; `useTheme` and the
  `index.html` flash guard follow); one cobalt signal colour replaces slate
  blue; a new `--vers-border-strong` ink rule; heat scale, status and entity
  colours retinted to the family. Every value was generated from OKLCH and
  AA-checked (muted text 6.2:1 / 4.9:1, accent-as-text 6.3:1 / 8.4:1).
- Shape and depth (`tailwind.config.js`): the radius scale collapses to 2–3 px
  and `shadow-warm-*` compile to rules, so no component needed a class change
  for either. `font-mono`/`font-display` are IBM Plex Mono.
- Type voice: `.type-display` (Plex Mono caps) on `BasePanelHeader`,
  `BaseSection`, `EmptyState` and the workspace headings; `.label-micro` is
  Plex Mono. The manuscript gets a ruled left margin and a cobalt caret; the
  active sidebar item is a cobalt `>` in the margin; chips are squared;
  modals are square with an ink rule; `liquid-glass` loses its shadow.
- `DESIGN.md` and `docs/DESIGN-TOKENS.md` rewritten for v4 (the Signal, Ink,
  Paper, Two-Voice, Tracking and Square rules). 3,065 tests green;
  `npm run policy` green; Storybook builds.

### Design system: catalogue, stories for every primitive, executable policies, tool-neutral agent rules (2026-09-15)
- `DESIGN.md` gains a **primitives catalogue**: all 15 `Base*` components in
  `src/components/ui/` with props, slots, events and what each is for.
  `docs/DESIGN-TOKENS.md` now documents every `--vers-*` token in `style.css`
  (the 28 that were missing: the `-rgb` composition twins, `--vers-accent-hover`,
  the five `--vers-heat-*` steps), corrects the typography table (the manuscript
  is IBM Plex Mono via `.manuscript`, not `font-body`; `font-spark/flow/polish/
  revise/display` are retired aliases with zero usages) and adds the twin rule.
- Storybook: 12 new stories so **every primitive has one** (`UI/*`): Alert,
  Checkbox, Field, PanelHeader, Popover, Radio, Section, Segmented, Spinner,
  StatusDot, Stepper, Switch. `storybook build` passes with all 15 indexed.
- `npm run policy` (`scripts/policy.mjs`, now in the CI `lint` job with
  `lint:tokens`): every token documented; every `Base*.vue` has a story; hex
  colour literals in `src/components/**.vue` ratchet against
  `scripts/policy-hex-baseline.json` (76 today across 11 files, may only fall;
  `--update-baseline` locks a gain in); the agent files point at `AGENTS.md`.
  Each check was run against a scratch breakage before landing.
- `docs/UX-ENHANCEMENTS.html`: a 20-example UI/UX study with a live demo per
  example on the shipped tokens (both themes). Four fill gaps with zero matches
  in `src/` (find & replace, unload flush + tab title, outline scroll-spy, read
  aloud); six close open items from `docs/UX-AUDIT.md` (#13, #14, inline add,
  generator modes, the five untouched panels, `structureTerms` strings).
- `AGENTS.md`: a **UI: the design system** section (the eight rules, in order of
  how often they are broken) and a **Which tool reads what** table. New
  pointers so every agent loads the same file: `CLAUDE.md` (`@AGENTS.md`,
  Claude Code previously loaded nothing here), `GEMINI.md`, `opencode.json`,
  `.cursor/rules/agents.mdc`, `.github/copilot-instructions.md`.

### CI: SonarCloud removed, lockfile made durable (2026-09-15)
- `ci.yml` drops the `sonarcloud` job and `backend-ci.yml` drops the
  scanner steps (and the Java runtime they needed). The stored token had
  been rejected with 403 for months; the scan was advisory and blocked
  nothing, but it was noise on every run. `sonar-project.properties`
  deleted; the `SONAR_TOKEN` secret can go.
- `npm ci` had failed on every run since `e916785b`: a Windows
  `npm install` pruned the optional peers `@emnapi/core` / `@emnapi/runtime`
  from the lock, and the Linux runner needs them. Pinned as exact
  devDependencies so no platform's install can drop them again.
- The `test` job runs the suite once (`test:coverage`) instead of twice.

### `qwen3:8b` is the default prose model (2026-09-15)
- `config/ollama.ts`: `DEFAULT_MODEL` flips from `dolphin-mistral:7b` to
  `qwen3:8b`; dolphin is exported as `UNCENSORED_MODEL` and offered in
  Settings → AI as an explicit opt-in for content qwen3 refuses to write
  plainly. Decided on the re-measure under the repaired critic: run 6 on
  qwen3 passed 29 of 30 scenes; back-to-back 1-chapter checks on one premise
  went 3/3 for qwen3 (8/8/8) and 0/3 for dolphin (voice 6, show/tell 5, one
  verdict unavailable; `degraded_rate`).
  `docs/GENERATION-PIPELINE-ANALYSIS.md` §8.
- The utility model keeps its own default and never inherits the prose
  choice — the "Same as main model" option was inaccurate and now reads
  "Default (qwen3:8b)". First-launch adoption of an already-pulled model
  is unchanged (`useAppInitialization`).

### Canvas map view — roadmap Phase 8 (2026-09-15)
- Story Canvas gains a **Map** view: upload a background image (persisted on
  the project row as `mapBackground`), pin characters / locations / threads
  by choosing one and clicking the map, drag pins to move them, double-click
  to unpin, **Pin all locations** auto-places the unpinned ones. Coordinates
  are `metadata.mapX` / `mapY` in 0..1 — Phase-1 metadata, no schema change.
  `utils/canvasCoords.ts` is pure. 8 tests.
- With this, all eight phases of the Obsidian-inspired roadmap lost on
  2026-08-19 are rebuilt and committed, one commit per phase.

### Ask your story — roadmap Phase 7 (2026-09-15)
- `stores/useStoryAssistantStore.ts`: a question is grounded in the closest
  scenes and bible entries from the Phase-3 index (reranked when there are
  more than the 6-chunk window), answered by the local model under a
  prompt that forbids invention and requires `[n]` citations; the citations
  the answer used are kept, a scene citation opens the scene. Pure
  `buildRagContext` / `buildRagPrompt` / `citedIn`.
- `StoryAssistantChat` from the palette ("Ask your story"): turns with
  citation chips; entity citations navigate to the bible card. Distinct from
  character chat (a persona) — this is the manuscript about itself. 10 tests.

### Templates — roadmap Phase 6 (2026-09-15)
- `stores/useTemplatesStore.ts`: templates are a title, fields, a body with
  `{{placeholders}}` and a mapping from fields to the scene-context columns;
  three built-ins (Scene, Chapter opener, Climax); custom templates persist
  in localStorage. `renderTemplate` / `metadataFromFields` are pure.
- `TemplatePicker` from the palette ("Insert a template"): fields seeded from
  the open scene, live preview, Insert puts the text at the cursor and writes
  POV / setting / cast onto the scene. 5 tests.

### Story Network — filters, local graph, search (roadmap Phase 5, 2026-09-15)
- `utils/graphFilters.ts` (pure): relationship-type collection, undirected
  adjacency `Map`, `computeLocalGraph` (BFS to depth N; edges between two
  reached nodes are kept), name search.
- Story Network gains a filter popover: per-relationship-type toggles (only
  those edges vanish), **Local graph** (click a node → its neighbourhood
  stays lit, everything else dims; depth 1–3), and find-a-node → `fitView`.
  "Who is connected to Halden?" is one click. 9 tests (VueFlow stubbed).

### Compile + DOCX/EPUB export — Obsidian roadmap Phase 4 (2026-09-15)
- `services/compileManuscript.ts`: pure `compileMarkdown` walks volumes →
  sections → scenes in narrative order (unfiled sections last; never reads
  the derived `volume.sectionIds`), with title style, scene titles, scene
  separator and frontmatter stripping as workflow options; `buildDocx` (lazy
  `docx`) and `buildEpub` (lazy `jszip`, minimal valid EPUB 3 with nav +
  ncx); `exportCompiled` hands the file to the browser.
- `CompileManuscript.vue` from the palette ("Compile manuscript"): live
  Markdown preview with chapter/scene/word counts; Markdown, Word, EPUB and
  PDF (the existing exporter) buttons.
- New deps `docx`, `jszip`, both loaded only when their format is requested.
  8 tests, including the DOCX and EPUB archives inspected with jszip.

### Related + Story Lookup — Obsidian roadmap Phase 3 (2026-09-15)
- Schema **v51** `contentVectors`: embeddings of the story's own bible
  entities and scenes, `researchChunks`-shaped so the same worker IVF index
  serves both; every row records `model` + `dim`.
- `services/storyVectorIndex.ts`: `indexStoryContent` / `indexStoryContentBatch`
  / `indexProject`, pure `rankVectors`, `searchStorySemantic` (worker index
  with brute-force fallback; a dimension mismatch warns once per project and
  still answers from matching rows), and a 500 ms per-key `scheduleStoryIndex`
  hooked into every character / location / thread / scene save through a
  lazy `storyIndexHook` so the db modules never load the worker stack.
- **Related** panel (analysis group; `related` slot): what is semantically
  close to the scene you are in, filter by kind, one-click *Link in graph*
  writes a `related` edge, *Reindex* embeds the whole story.
- **Ask the story** (command palette): plain-words lookup across manuscript
  and bible; selecting a hit opens the scene or the bible card.
- 15 new tests. Local embeddings only; nothing leaves the device.

### Story Query — Obsidian roadmap Phase 2 (2026-09-15)
- `services/storyQuery.ts`: pure, total query engine — dataset + filters
  (`eq neq contains in empty notEmpty gt lt`, AND/OR) + sort (empties last) +
  group (`Map`, list fields fan out) over rows; reads `metadata.*` custom
  fields and discovers them as typed columns; 500-row cap. Five presets:
  scenes with no cast, revision checklist, scenes by POV, characters by tag,
  generated-not-approved.
- `stores/useStoryQueryStore.ts`: the active query over the story-bible and
  manuscript stores' own rows; edits write back through `update*Data` /
  `setEntityMeta` — one query surface, not a third copy of the data.
- `StoryQueryView.vue` as a **Query** tab in the Story Bible: presets,
  dataset picker, filter rows, All/Any, group-by, sortable columns,
  double-click inline edit. `BaseChip` now forwards attrs.
- "Which draft scenes have no characters?" is one click. 17 new tests.

### Properties & scene metadata — Obsidian roadmap Phase 1 (2026-09-15)
- Schema **v49**: `metadata` (open JSON) + `*tags` on characters, locations and
  plot threads; `pov`, `location`, `*charactersPresent` on sections and
  subsections; `wordCount` on subsections. This was built as v48 on 2026-08-19
  and lost uncommitted (`planning/AUDIT-2026-09-15.md` §1); the perf pass took
  v48, so the rebuild lands as v49.
- Story-bible store: `findEntity`, `getEntityMeta`, `setEntityMeta`,
  `addEntityTag`, `removeEntityTag`, `getEntityArray`. `EntityPropertiesPanel`
  (typed custom fields + tags) mounted on every Story Bible card. The scene
  dialog gains POV, location (with bible datalists) and characters present.
- Single authority for scene context: `writeSceneAnalysis` reads the
  subsection's columns back into the digest when the author set them and
  hydrates them when empty — never overwrites; `wordCount` recomputed on every
  commit. The digest gains `pov`.
- `useDigestBackfill` and `backfillSceneContextV48` now run at idle on project
  open; both had been written with no caller, so a hand-written manuscript
  never got digests.
- Custom fields and tags round-trip through the character/location sync blob.

### Two product decisions, made (2026-09-15)
- **Discovered entities outside one-click mode are reviewed, once, at the end.**
  One-click keeps committing per chapter (that is what one-click means). A
  reviewed run collects everything the writer discovered and pauses in the
  batch path's existing sync-preview; `confirmSync` commits the accepted
  entities and edges against every structured result and completes the run.
  Before this the parallel path synced nothing in any mode.
- **A zero-issue verdict is a clean scene, not a broken critic — until every
  scene is one.** Recorded as the non-degrading ledger kind `eval_suspect`;
  `critic_flat` warns at run end when all ≥6 judged scenes raised no issue.
  Nothing is retried or discarded per scene.

### Tests — the panels the panel pass rewrote (2026-09-15)
- Component tests for `ConsistencyPanel`, `BetaReaderPanel` and `WhatIfPanel`
  (+ `WhatIfAlternative`): severity grouping and header counts, honest empty
  states ("Not checked yet" vs "Everything lines up"; "Nothing to read yet"
  never "Reads clean"), summary shown *with* the findings, always-visible
  Insert/Replace on alternatives, the premise actually sent, the divergence
  flow timeline → editor with the fork gated on a premise.

### Generation — one budget, one failure ledger (2026-09-15)
- `useDelegatorGeneration` accepts the orchestrator's director / writer /
  critic / sync instances and wires the session budget onto them. It used to
  build a second instance set, wire the budget there, and rely on
  `useVolumeStoryGenerator` re-assigning the budget onto the real ones
  (architecture review C2). One set now; `gen.sessionBudget` exposes it.
- The three ad-hoc failure counters (`runFailedScenes` increments,
  `runConsecutiveFailures`, `consecutiveWriteFailures`) are replaced by two
  ledger kinds — `critique_failed` (kept-for-review after retries) and
  `write_failed` (no prose) — with `RunHealth.streak()`, `resetStreak()` and
  `failedScenes()`; the quality floor and the write-streak abort read those.
  `runFailedScenes` remains as the exposed number, derived from the ledger.

### Sync — foreign keys crossed as local ids (2026-09-15)
- `branches.sourceBranchId` and `volumeEntities.entityId` were pushed as the
  browser's local ids (`sectionId`/`volumeId` were translated; these two were
  not), so a synced fork pointed at a branch the server did not know and a
  volume membership at an entity it could not find. Both now translate through
  `lookupApiId`/`lookupLocalId` in both directions; `entityId` resolves
  through the table named by `entityType`. Schema **v50** adds the `apiId`
  index `branches` never had (the pull-side lookup threw without it).
  Pinned by `syncMapperIds.test.js` against real Dexie.

### Generation — reading the book (2026-09-15; `6aab7b44`, `82a7fa88`, `941cbc22`, `46384ced`)
- **The bible never moved because sync never ran.** `confirmPlan` always
  takes the parallel strategy, which never called `discoverSync`/`commitSync`
  (only the batch path did); and `commitSync` itself threw on its first line
  (`graphStore.nodeInstances.value` on a Pinia-unwrapped ref →
  `JSON.parse("undefined")`), caught and logged. New
  `generation/writing/bibleSync.ts` syncs each chapter once its scenes land —
  discovered entities as `generationStatus: 'generated'`, edges stamped with
  the chapter — and `commitSync` returns what it wrote so `bible_static`
  counts commits. Pinned end-to-end in `volumeGeneratorRun.test.js`.
- **The critic's 7 was fabricated.** `CRITIC_SCHEMA` had no `required`;
  under grammar-constrained output qwen3:8b returned
  `{ pass: true, strengths }` on 30/30 scenes and `useStoryCritic` defaulted
  the missing score to 7 with zero issues. Every field is now required with
  the dimension names in the grammar; a missing score is derived from the
  dimensions, never a constant; a verdict-less answer is retried once, then
  reported as `evalUnavailable`. Live probe (`criticProbe.live.js`): same
  scene now scores 8 with show_tell 7 and a named issue, stable across
  repeats. Four new critic tests.
- `bible_static` now means "metadata was produced but never passed through
  sync" (`scenesSynced === 0`); a run that synced every scene and added
  nothing is a quiet story, warned as `bible_quiet` only past 9 synced
  scenes. A one-chapter live run whose cast the bootstrapper had already
  created tripped the old check after the fix.
- Live harness reports newly filled scene slots and dumps the committed
  bible into `health.json`. `PdfProject` gains `description` (`tsc` clean).
- CI had been red since 2026-09-11 for reasons unrelated to any change:
  jsdom 30 requires Node ≥ 22.22 and every Vitest fork worker died on the
  20.x runner (`webidl.util.markAsUncloneable`); one test file was not
  Prettier-formatted; and `backend-ci.yml` used the `secrets` context in a
  step `if`, which is a parse error, so no backend job or image publish had
  run since it was added. Node 22.x everywhere, `engines.node >= 22.22`,
  `SONAR_TOKEN` mirrored into `env`.
- Sonar upload steps are advisory in both workflows: the stored
  `SONAR_TOKEN` is rejected (403) and a failed report upload was failing
  green builds. Lint, tests and build remain the gate.
- Repository licensed under MIT.

### Generation — running the book (2026-09-12 → 2026-09-14; landed in `6aab7b44`)
- Live harness: `vitest.live.config.js` + `src/tests/live/saltRoad.live.js`
  run the real pipeline against local Ollama headless under fake-indexeddb,
  streaming to `reports/live/<slug>/` (`c2c3cfb` 5-scene pilot, `a67c566`
  chapter-2 pilot with prior-chapter seeding, then the 10-chapter run).
  Run 5 (qwen3:8b prose): 10 × 3 scenes, 28,457 words, 62 min,
  `phase=complete`, zero gate failures — `docs/examples/the-salt-road.md`.
- Ollama rejected every director skeleton call: `repeat_last_n: -1` is
  HTTP 400 on the server, so every plan came from the degraded path. `-1`
  now resolves to `num_ctx` (`providers/ollama.ts`).
- A scene that fails the gate after `SCENE_MAX_ATTEMPTS` is committed as
  its best attempt with `contentStatus: 'review'` and a `gate_failed`
  health event instead of leaving a hole; a quality-floor breach is
  recorded and the run finishes instead of ending in `error`.
- Chapter progression contract (`events`, `revealed`, `stateAfter`,
  `storyFunction`, `partOf`) survives `validatedChapters` and reaches the
  spine, the writer's brief and the plan preview; interior "reflects /
  decides" events are refused by the skeleton prompt and replanned
  (`findInteriorChapters` + shared `replanChapter`).
- Writer canon block: bible names are the only names; unnamed roles are
  never given a canon name.
- Scene digests recorded at commit time (`f937b14`); cross-chapter
  tense-regime gate (`6d3aba1`); seam carry pinned across the real pilot
  boundary (`52b207e`).
- Critic seams: `chapterLogBefore` gives every critic call the prior
  scenes (G1); review-mode prefetch drafts scene *i+1* knowing scene *i*
  (G2); anchors keep the gate's verdict instead of a second critique (G3).
  Boundary audits scope to touched entities; fix rounds recheck only
  flagged ones (C1/C2). End-to-end orchestrator test
  `volumeGeneratorRun.test.js` (M1).
- Split: `generation/writing/{sceneGate,parallelStrategy,batchStrategy}`
  out of the orchestrator (4,006 → 2,795 lines); one
  `useGenerationRunController` + `GenerationRunView` for chapter and arc
  runs (panel 2,268 → 932 lines).
- Project premise was stored as `synopsis` and never read back; now
  `description`/`category` with a `synopsis` fallback. Demo projects are
  stamped with the signed-in owner. Generation settings gain a `focus`
  field (`e3be227`).
- Dolphin critic / tense-flip probes (`fea31c1`).

### Shell and panels (2026-09-12 → 2026-09-14; landed in `f2ae4127`)
- Tool panels dock right, canvas dominant (`edea0fd`); generator shows
  its selection, a plain counter and a single spark flow (`e664db6`);
  history has honest empty and scoreless states (`1ecd3f5`, `24b5c03`).
- Panel grammar in `src/components/ui/` (`BasePanelHeader`,
  `BaseSection`, `.label-micro`) applied to every tool panel; Tailwind
  opacity classes that emitted no CSS (`/8`, `/12`, `/35`) fixed —
  `docs/UX-AUDIT.md` "Panel pass".
- Autosave no longer appends three permanent rows per save: content
  snapshots dedup and cap at 40/chapter, state snapshots throttle to one
  per 5 min and cap at 50/project, reads are `O(limit)` over the new
  `[projectId+timestamp]` indexes (schema v48) — `docs/PERF-AUDIT.md`.
- Progress, goals, streak and the workspace heatmap count the whole
  manuscript (root + sections + subsections), not just the root document.

### Offline-first architecture, Phases 2–4 (2026-09-09 → 2026-09-11)
- Deterministic contradictions as a tree traversal: Pass-1 chapter
  grouping (`3bd821b`), Pass-2 cross-chapter rules (`0359d53`), volume
  drift rules (`ff7d418`), chapter rollup in the candidate ledger
  (`7af4f48`), substitution threshold calibrated at 4 scenes (`a7d26d3`).
- Per-scene `threadIds` from the director's catalog into the scoped blob
  (`77857fb`), preserved through plan assembly (`5cbcfdb`).
- Context reports the budget it enforces, not a phantom constant
  (`0a4a620`); keyed vector-worker wiring with correct fallback
  (`f2bfb81`, `0123af0`); atomic research reindex (`336e7a9`).
- Cloud tier: injectable JSON-generator seams for contradiction, arc and
  repetition passes (`a3ceabe`, `e1f880e`, `4c3e5fb`); budget-guarded
  cloud batch injector with local fallback (`621528e`); tier-gated routing
  with graduated consent (`37ca8d5`, `c4b0865`, `c362e2e`); per-project
  cloud audit opt-in (`b69950e`); combined full-audit disclosure
  (`2f5d3d0`); audit-tier auto-request for on-failure second opinions
  (`668decb`); critic score floor on the revisor short-circuit (`fcfe5df`).
- Manuscript-scoped shape analysis joins the finalize contract
  (`bc4e02a`); run-created sections populated so chapters aggregate
  (`87632f3`); audit outages recorded instead of reported clean
  (`1e4c4c3`); sync surfaces row failures, retries them and pushes
  stranded tables (`4d0d47c`).
- Word-level diff helper and inline word-diff in the revision delta
  panel (`0817b6f`, `f5087ab`); raw-scenes dump mode in the manuscript
  audit (`a4a3e87`).
- Auth accepts username or email (`31fe00e`); frontend container listens
  dual-stack so its healthcheck passes (`99695ee`).
- Live-Ollama consistency and beta-reader tests prove inference instead
  of passing vacuously (`48773bd`, `c282682`, `98bbcf3`).

### Security
- Close the open Mistral embedding relay behind `[Authorize]` plus a
  dedicated 20/min limiter (`24773d6`, verified live: anonymous embedding
  calls return 401). (The companion Hangfire-dashboard lock from that change
  is gone with upstream's later Hangfire removal — no dashboard exists.)
- Stop returning plaintext API keys: `GET /api/apikeys/{provider}` returns a
  masked hint only; the SPA falls back to its local copy (`24773d6`).
- JWTs from query strings accepted only for SignalR hubs; generic 500
  details; per-user cache keys (`24773d6`).
- Add a DOMPurify-backed `sanitizeHtml` util so the first future `v-html`
  sink has a safe path; no raw-HTML sinks exist today (`aa97023`, 5 tests).

### Added
- Chapter-gate warnings (all warn-only, never discard prose): malformed and
  CJK-token scan (`035314a`, `63d4f99`), cross-scene narrative-tense
  consistency (`0f566c0`), scene-payoff coverage (`440d22e`). Each proven
  against real Ollama samples, not just fixtures.
- `tools/generate-sample.mjs`: real-model sample generation plus critic,
  gates and chapter acceptance in one command.
- `TESTING.md`: contributor guide to every suite and its conventions.
- SonarCloud C# scanning and opencover collection in backend CI
  (`a372b17`; first master run confirms the upload).

### Changed
- Frontend decomposition: single-utility homes, batched IndexedDB loads,
  coalesced Dexie writes, extracted graph persistence, run mechanics and
  eval bootstrap (`9c3c0e4`…`c37914b`).
- Toolchain: ESLint 8→10 with flat config (`4ddadc7`), Vitest 1→5
  (`9e7cba9`), Dexie 3→4 (`df7592a`), TipTap 2→3 (`bbd9732`),
  VueUse 10→14 (`2a8e802`), jsdom 24→30 (`aade527`), Vite 8.2.2
  (`364d1bd`). Each verified green or rolled back; none required any.
- `docker compose` runs the full stack (api, redis, nginx proxy, optional
  ollama profile); backend migrations run in-container (`25a812e`).
- Retry-backoff tests use fake timers; `testTimeout` tightened 30s→15s on
  measured evidence (`0af3631`).
- Live-Ollama consistency test gated behind `OLLAMA_LIVE_TESTS=1`
  (`95bb53c`); reachability never meant reliable.

### Fixed
- Antiforgery misconfiguration that 500'd every mutating endpoint
  (pre-existing; found live during Phase 1).
- Sync transport re-POSTing duplicates after a crash between POST and local
  write; re-push now PUT-updates the known record (`d26d42d`).
- Demo account (`test`/`test123`, advertised in the UI) could never log in;
  seeds in dev/test only, never production builds (`468ed22`).
- Missing seam-disconnect rules, metadata-chunking exports and guardrail
  kind registration that 18 tests were written for
  (`2338961`, `a7e6c51`, `e3c097d`). Full suite (`95bb53c`): 2786 pass,
  1 intentional skip, zero failures; `tsc` zero errors.

## [v1.0] and earlier

See `git log v1.0` and earlier history. Entries above start where
systematic verification started; older history is uncurated.
