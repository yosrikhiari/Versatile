# AGENTS.md

Fiction writing assistant. Vue 3 + Pinia + TipTap frontend, .NET 10 + PostgreSQL 16 backend, 5 AI providers.

## Tech Stack

- **Frontend**: Vue 3 (Composition API), TypeScript, Pinia stores, TipTap 3 editor, Vite 8, Vitest 5
- **Backend**: .NET 10, PostgreSQL 16 (RLS), Redis, Entity Framework Core, SignalR
- **AI**: 5 providers (Ollama default, OpenAI, Anthropic, Gemini, Groq); Ollama runs a prose model and a separate `qwen3:8b` utility model
- **Storage**: IndexedDB via Dexie 4 (offline-first, schema v51), PostgreSQL (server)
- **Build/CI**: npm/vite for frontend, dotnet for backend

## Key Conventions

- **Stores** in `src/stores/` — Pinia with setup syntax (`defineStore('name', () => { ... })`), 20 of them
- **Composables** in `src/composables/` — reusable composition logic; the generation engine is under `composables/generation/` (writing strategies, context, commit, consistency, delegator, lifecycle)
- **Components** in `src/components/` — organized by domain (`storybible/`, `editor/`, etc.); panels are built from the `Base*` primitives in `components/ui/` (`BasePanelHeader`, `BaseSection`) — no ad-hoc cards or eyebrows
- **Tests** in `src/tests/unit/` — Vitest with `vi.useFakeTimers()` for debounce tests
- **API calls** go through services in `src/services/`
- **Debounce** any IndexedDB write or expensive computation triggered by rapid user input
- **Schema changes**: add a version to `db-schema.ts` with a comment, a handler in `db-migrations.ts` if data moves, and update `EXPECTED` in `dbSchema.test.js`; log it in `docs/database-schema-changelog.md`
- **Generation contract**: gates warn, never discard prose; a failed scene commits its best attempt as `review`; every degradation is counted in `runHealth`

## Performance Rules

- Word count → debounce (300ms) via `wordCountTimer`
- IndexedDB writes → debounce (500ms) via per-field timers
- Lookups in render loops (`getEdgeOpacity`, `getStroke`) → use pre-computed `Map` objects, not `Array.find()`
- Independent DB queries → `Promise.all` not serial `await`
- Computed from large reactive arrays → direct property mutation, not spread re-creation
- Only add dependencies that actually change the result to `watch()` / `computed()`
- History tables are append-only: read "latest N" through a reverse index cursor over `[projectId+timestamp]`, never `toArray()` then sort

## Testing

- `npm run test:run` — Vitest suite (≈2,950 tests, ~2 min)
- `npm run typecheck` — `tsc --noEmit`, zero errors
- `npm run lint` — ESLint
- `npm run build` — Vite production build
- `dotnet test backend/Versatile.slnx` — backend suite
- New features add tests; debounce tests use `vi.useFakeTimers()`
- **Both suites are green. A failing test is a regression — never pre-existing.**
  Suites that call `vi.resetModules()` must drain their module's async work
  before the test ends: a new module registry does not stop the old instance,
  and a stray timer firing inside a later test fails whichever test it lands on.
- Real-model runs are not tests: `tools/generate-sample.mjs` (one chapter) and
  `vitest.live.config.js` (a whole book, headless). Mocked tests have missed
  silent overflow and JSON-envelope defects before — a pipeline change that
  touches prompts or provider options wants one real run. See `TESTING.md`.

## Architecture Notes

- Offline-first: Dexie.js writes are batched and debounced; sync happens in background
- Story graph uses Canvas/SVG with cached edge lookups for performance
- Scene evaluations stored in reactive `Map` by scene ID
- Tool panels dock to the right of a canvas-dominant shell; the sidebar and Ctrl+K palette share one definition
- Docs that stay current: `README.md`, `ARCHITECTURE.md`, `API.md`, `TESTING.md`, `CHANGELOG.md`, `docs/GENERATION-PIPELINE-ANALYSIS.md`, `docs/UX-AUDIT.md`, `docs/PERF-AUDIT.md`, `docs/database-schema-changelog.md`, `docs/sync-status.md`; `planning/` is a local, gitignored workbook (`planning/README.md` is the index)
