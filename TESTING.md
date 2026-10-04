# Testing

How to run every check in this repo, and the conventions new tests must follow.

## Frontend (Vitest)

```bash
npm test              # watch mode
npm run test:run      # single run: 326 files (1 skipped), ≈3,470 tests
npm run test:coverage # what CI runs: v8 coverage with thresholds (statements 38, branches 30, functions 31, lines 38)
npm run typecheck     # tsc --noEmit, must be zero errors
npm run lint          # eslint, zero errors (warnings are pre-existing)
npm run lint:tokens   # banned class patterns (retired fonts, wrong accent pairings)
npm run policy        # repo policies (tokens documented, stories, hex/shape/any ratchets, heading voice, agent files)
```

With a model loaded in Ollama, the default worker pool can run out of
memory; `npx vitest run --maxWorkers=3` is how the suite is run locally.

- Suites live under `src/tests/` (`vitest.config.js` includes
  `src/tests/**/*.test.{js,ts,jsx,tsx}`): `unit/` (the bulk, 302 files),
  `integration/` (10 multi-component flows: context pipeline, editor
  population, voice extraction, volume membership, the chapter-tab panel,
  book analysis, novel import, What If branches, branch integrity),
  `audit/` (consistency, eval gates, revisor), `evaluation/` (retrieval
  quality), plus 9 top-level eval/critic specs. All run in jsdom with
  fake-indexeddb. `live/` holds `*.live.js` real-model runs, which only
  `vitest.live.config.js` picks up (see below).
- **Fake timers are mandatory** for anything touching a timer (`vi.useFakeTimers()`):
  attach rejection assertions *before* advancing time (otherwise the rejection
  fires unhandled mid-advance), and always restore in `finally`/`afterEach`
  with `vi.clearAllTimers()` — a stray timer fails whichever later test it
  lands in.
- **Timeouts are load-calibrated**: `testTimeout` 15s, `hookTimeout` 60s.
  Slower than that on an offline CPU-bound suite means a hang, not load.
  Retry/backoff tests must use fake timers, never real sleeps.
- **Live-model tests are opt-in**: `OLLAMA_LIVE_TESTS=1` runs the Ollama-backed
  consistency and beta-reader tests; without it, they skip. Reachability never
  gates a test — a live model is nondeterministic by timing and load. A live
  test must prove inference happened (assert on the model's output), not pass
  vacuously when the fixture has nothing to find.
- Debounce tests use `vi.useFakeTimers()` + `advanceTimersByTimeAsync`.
- **The orchestrator has an end-to-end test**: `volumeGeneratorRun.test.js`
  drives `startGeneration → confirmPlan → write → completeGeneration` on the
  real orchestrator, real stores and Dexie, faking only the model by schema
  name. New pipeline seams get an assertion there (what the critic was called
  with, what the writer's brief contained), not a mock of the orchestrator.
- **Schema changes**: update `EXPECTED` in `dbSchema.test.js` for every
  version, and cover every handler in `db-migrations.ts` in
  `dbMigrations.test.js`. History-table bounds are tested against real Dexie
  (`historyTables.test.js`).

## Backend (.NET 10)

```bash
dotnet test backend/Versatile.slnx
dotnet test <TestProject> --collect:"XPlat Code Coverage;Format=opencover"
```

- xUnit across `Versatile.Api.Tests`, `Application.Tests`,
  `Infrastructure.Tests`, `IntegrationTests` (all green; integration tests use
  in-memory providers, no live Postgres needed).
- Coverage uses the referenced coverlet collector, locally only: CI no longer
  collects it (SonarCloud was removed on 2026-09-15, `8d75dd2d`).

## E2E (Playwright, Chromium)

```bash
npm run test:e2e:install   # one-time browser install
npm run test:e2e           # boots `npm run dev` automatically
```

Config: `playwright.config.js` (Chromium only; CI installs it with
`npx playwright install --with-deps chromium`). Specs in `e2e/`: `smoke`,
`auth`, `responsive`, `panel-dock` (right-docked panels, canvas dominant),
`generator-survives-panels` (run options set in the Generator panel survive
a trip to another panel), `generator-reskin` and `agents-panel` (the Agents
panel: orchestrator switch reveals the empty state, the tracing switch
toggles, a second GPU model shows the eviction error while editing and the
CPU device clears it — skipped when Ollama serves only one model). Full user journeys are
covered by mocked pipeline tests in
`src/tests/unit/e2ePipelineIntegration.test.js` instead.

## Real-model runs (manual QA)

None of these are tests; they need local Ollama with the models pulled and
are measured in minutes to hours. Output goes to `reports/` (gitignored).

```bash
# 2-scene chapter + critic scores + gate verdicts, ~5 min
npx vite-node tools/generate-sample.mjs --model qwen3:8b --words 400

# a whole book through the real pipeline, headless (default 10 × 3 × 2,400 words)
LIVE_MODEL=qwen3:8b npx vitest run --config vitest.live.config.js src/tests/live/saltRoad.live.js
```

Name the file: `src/tests/live/` also holds 15 measurement probes (critic,
gate, continuity, repair, ...) and the sync round trip, none gated by an env
var, and the config without a path runs all 17 one after another. Each
file's header gives its own command.

The sync round trip needs no model, only the compose stack:

```bash
docker compose up -d postgres redis api
npx vitest run --config vitest.live.config.js src/tests/live/syncRoundTrip.live.js
```

It registers a fresh account, pushes two projects from one "device", wipes
the local database, pulls them back as a second device, edits and deletes,
and checks every step against the server's own answers (`SYNC_API`
overrides `http://localhost:5171`). Run twice inside a minute it meets the
100/min rate limit and waits out `Retry-After`, which takes about a minute.
The backend integration suite cannot catch what this does: it runs in the
`Testing` environment, where the response cache is off and the database is
in memory.

The live config is standalone (not merged with `vitest.config.js`) because
`mergeConfig` concatenates `include` and would pull the unit suite into every
run; it runs one file at a time because there is one GPU. Progress streams to
`reports/live/<slug>/progress.log`; the outline is dumped as soon as it
exists (`plan.json`), the finished book as `book.md`, and the run's health
ledger as `health.json`. `LIVE_TITLE`, `LIVE_CHAPTERS`, `LIVE_SCENES`,
`LIVE_WORDS`, `OLLAMA_HOST` and `LIVE_MODEL` (prose model; the utility model
stays `qwen3:8b`) override the defaults; the file header lists the rest
(`LIVE_PREMISE`, `LIVE_ORCHESTRATOR`, `LIVE_MODE`, `LIVE_PRESET`,
`LIVE_TRACE`, `LIVE_FOCUSED`). A browser-driven run dies on any
Vite full reload — this is why the harness exists.

Then:

```bash
npm run audit:manuscript        # duplicate / degraded prose re-measured from the DB
npm run eval:snapshot           # critic regression baseline (SNAPSHOT_MODEL=qwen3:8b … --validate-all)
```

For a UI or CSS upgrade, `tools/style-snap/` records every element's computed
style on the main screens and diffs two runs (`node tools/style-snap/snap.mjs
<label>` with the dev server on :5175, then `node tools/style-snap/diff.mjs
<a> <b>`; Playwright through the installed Edge, output in `reports/tw-snap/`).
It verified the Tailwind 4 upgrade.

## CI

`.github/workflows/ci.yml` runs `lint` (ESLint, typecheck, `lint:tokens` +
`policy`, Prettier check), `test` (`test:coverage` + production build on
Node 22.x), `e2e` (after `lint`) and `backend` (restore/build/test the
solution) on pushes to `master`, `develop`, `feature/*` and PRs to
`master`/`develop`. `backend-ci.yml` (pushes and PRs to `master` that touch
`backend/**`) builds and
tests the backend again, uploads the `.trx` results and, on a push to
`master`, pushes the API image to GHCR. SonarCloud was removed from both on
2026-09-15 (`8d75dd2d`): the token had been rejected for months and the scan
gated nothing. `eval-regression.yml` (critic regression on PRs),
`deps-audit.yml`, `stale.yml` and `branch-cleanup.yml` are separate.
`chromatic.yml` exists locally but is gitignored until a
`CHROMATIC_PROJECT_TOKEN` secret exists, so Chromatic does not run in CI.

## Multi-agent graph (2026-09-18)

- `rolePlacement.test.js` — the placement table: inheritance, lanes, `num_gpu`,
  the one-GPU-model rule and the judge-is-author warning.
- `storyEditor.test.js` — `legalMoves()` as the fence, the workflow policy,
  answer validation (illegal move, missing lane, one scene on both lanes),
  agentic fallbacks (illegal answer, failed call).
- `dexieSaver.test.js` — checkpoint round-trip through Dexie, hydration in a
  fresh instance, pending writes, `deleteThread`.
- `graphStrategy.test.js` — the graph with a scripted Writer and Critic: proves
  the Critic starts on scene 0 before the Writer finishes scene 1 (two lanes),
  a failed scene is revised with the critic's feedback, every scene commits,
  one bible sync per chapter, every superstep logged, a Dexie checkpoint row
  exists; agentic mode honours a model's accept-for-review; a two-GPU-model
  placement is refused before any draft.
- A hook that *returns* a spy (`beforeEach(() => spy.mockReset())`) hands
  Vitest a teardown function; use braces. Found the hard way.
- Real-model run: `tools/generate-sample.mjs` with `settings.orchestrator =
  'langgraph'` (see `docs/GENERATION-PIPELINE-ANALYSIS.md` §9 for the A/B
  protocol). Mocked tests prove the control flow, not the prose.
- `OrchestrationPanel.test.js` — the Agents panel mounted: legacy vs graph
  state, the empty state that leads to the generator, a live run rendered
  from the store (lanes, activity per role, scenes, decisions, warnings),
  placement edited in place, the preset, the tracing switch and the Traces
  list.
- `agentopsTransport.test.js` — the AgentOps wire shape (OpenAI messages,
  `max_tokens` from `num_predict`, `options` / `format` / `keep_alive` /
  `think`, the role and a ≤64-char client ref in headers), SSE parsing
  across chunk boundaries, the trace id reported per call, the native path
  untouched when tracing is off, `unknown_model` → "register it in
  `OLLAMA_MODELS`", a mid-stream gateway error surfaced.
- A traced real run: start AgentOps v1.1 with
  `OLLAMA_MODELS=qwen3:8b,qwen2.5:3b-instruct` (plus Postgres for spans),
  switch `Trace via AgentOps` on in the Agents panel, run one chapter, then
  open a trace from the panel's Traces list: `model.generate` must carry
  `agent_role`, `params.num_gpu` (0 for the critic), `params.keep_alive` and
  no prompt text. Recorded in `docs/GENERATION-PIPELINE-ANALYSIS.md` §9.
