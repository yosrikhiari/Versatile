# Testing

How to run every check in this repo, and the conventions new tests must follow.

## Frontend (Vitest)

```bash
npm test              # watch mode
npm run test:run      # single run (CI shape)
npm run test:coverage # v8 coverage with thresholds (statements 38, branches 30, functions 31, lines 38)
npm run typecheck     # tsc --noEmit, must be zero errors
npm run lint          # eslint, zero errors (warnings are pre-existing)
```

- Tests live in `src/tests/unit/`, run in jsdom with fake-indexeddb.
- **Fake timers are mandatory** for anything touching a timer (`vi.useFakeTimers()`):
  attach rejection assertions *before* advancing time (otherwise the rejection
  fires unhandled mid-advance), and always restore in `finally`/`afterEach`
  with `vi.clearAllTimers()` — a stray timer fails whichever later test it
  lands in.
- **Timeouts are load-calibrated**: `testTimeout` 15s, `hookTimeout` 60s.
  Slower than that on an offline CPU-bound suite means a hang, not load.
  Retry/backoff tests must use fake timers, never real sleeps.
- **Live-model tests are opt-in**: `OLLAMA_LIVE_TESTS=1` runs the Ollama-backed
  consistency test; without it, it skips. Reachability never gates a test —
  a live model is nondeterministic by timing and load.
- Debounce tests use `vi.useFakeTimers()` + `advanceTimersByTimeAsync`.

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

Smoke/auth/responsive specs only. Full user journeys are covered by mocked
pipeline tests in `src/tests/unit/e2ePipelineIntegration.test.js` instead.

## Sample generation (manual QA)

```bash
npx vite-node tools/generate-sample.mjs --model qwen3:8b --words 400
```

Writes a real-model 2-scene chapter plus critic scores and gate verdicts to
`reports/` (gitignored). Needs local Ollama with the model pulled.
