# Testing

How to run every check in this repo, and the conventions new tests must follow.

## Frontend (Vitest)

```bash
npm test              # watch mode
npm run test:run      # single run (CI shape) — 279 files, ≈3,060 tests, ~2 min
npm run test:coverage # v8 coverage with thresholds (statements 38, branches 30, functions 31, lines 38)
npm run typecheck     # tsc --noEmit, must be zero errors
npm run lint          # eslint, zero errors (warnings are pre-existing)
```

- Suites live under `src/tests/`: `unit/` (the bulk, 243 files),
  `integration/` (multi-component flows: context pipeline, editor
  population, voice extraction, volume membership, the chapter-tab panel),
  `audit/` (consistency, eval gates, revisor), `evaluation/` (retrieval
  quality), plus a few top-level eval/critic specs. All run in jsdom with
  fake-indexeddb.
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
- Coverage uses the referenced coverlet collector; CI uploads opencover to SonarCloud.

## E2E (Playwright, Chromium)

```bash
npm run test:e2e:install   # one-time browser install
npm run test:e2e           # boots `npm run dev` automatically
```

Specs in `e2e/`: `smoke`, `auth`, `responsive`, `panel-dock` (right-docked
panels, canvas dominant) and `generator-reskin`. Full user journeys are
covered by mocked pipeline tests in
`src/tests/unit/e2ePipelineIntegration.test.js` instead.

## Real-model runs (manual QA)

None of these are tests; they need local Ollama with the models pulled and
are measured in minutes to hours. Output goes to `reports/` (gitignored).

```bash
# 2-scene chapter + critic scores + gate verdicts, ~5 min
npx vite-node tools/generate-sample.mjs --model qwen3:8b --words 400

# a whole book through the real pipeline, headless (default 10 × 3 × 2,400 words)
LIVE_MODEL=qwen3:8b npx vitest run --config vitest.live.config.js
```

The live config is standalone (not merged with `vitest.config.js`) because
`mergeConfig` concatenates `include` and would pull the unit suite into every
run; it runs one file at a time because there is one GPU. Progress streams to
`reports/live/<slug>/progress.log`; the outline is dumped as soon as it
exists (`plan.json`), the finished book as `book.md`, and the run's health
ledger as `health.json`. `LIVE_TITLE`, `LIVE_CHAPTERS`, `LIVE_SCENES`,
`LIVE_WORDS`, `OLLAMA_HOST` and `LIVE_MODEL` (prose model; the utility model
stays `qwen3:8b`) override the defaults. A browser-driven run dies on any
Vite full reload — this is why the harness exists.

Then:

```bash
npm run audit:manuscript        # duplicate / degraded prose re-measured from the DB
npm run eval:snapshot           # critic regression baseline (SNAPSHOT_MODEL=qwen3:8b … --validate-all)
```

## CI

`.github/workflows/ci.yml` runs `lint` (ESLint, typecheck, Prettier check),
`test` (unit + coverage + production build on Node 22.x), `e2e`,
`sonarcloud` and `backend` (restore/build/test the solution) on pushes to
`master`, `develop`, `feature/*` and PRs to `master`/`develop`.
`backend-ci.yml` additionally runs SonarCloud C# analysis with opencover and,
on `master`, pushes the API image to GHCR. The Sonar uploads are advisory
(`continue-on-error`): lint, tests and build are the gate. They have returned
403 since the stored `SONAR_TOKEN` stopped being accepted — regenerate it at
sonarcloud.io and update the repository secret to get reports back. `eval-regression.yml` and
`chromatic.yml` are separate.

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
