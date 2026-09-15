# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries cover work
done after `v1.0`; each references the commit whose message records how it
was verified.

## [Unreleased]

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
