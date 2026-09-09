# Architecture

Versatile is a fiction-writing assistant: an offline-first Vue SPA for
manuscript work plus a .NET 10 API for identity, persistence, collaboration
and server-side AI. The full audit and remediation history lives in
`planning/`; API conventions in `API.md`; suites in `TESTING.md`.

## System map

```
browser (Vue 3 SPA, Dexie/IndexedDB) ──/api, /hubs──► .NET 8 API ──► PostgreSQL 16 (RLS)
        │ direct provider calls ▲                                    Redis (cache, rate limits)
        └───────────────────────────── 5 AI providers (openai, anthropic, gemini, groq, ollama)
```

## Frontend (`src/`)

- **Vue 3 Composition API + Pinia** (`src/stores/`, ~20 stores with setup
  syntax): `projectStore` and `manuscriptStore` own the document graph;
  `storyBibleStore`, `storyGraphStore`, `volumeStore` own world state;
  `settingsStore`/`authStore` own identity and keys.
- **Editor**: TipTap 3 (`BubbleMenu` from `@tiptap/vue-3/menus`) with
  autosave debounce and unmount flush — pinned by tests.
- **Offline-first**: Dexie 4 (`src/services/db-*.ts`, ~20 table modules)
  is the source of truth in the browser. Writes are debounced and
  coalesced per entity; sync to the API replays in the background and
  self-heals (re-push PUT-updates instead of duplicating).
- **Components** (`src/components/`) are organized by domain
  (`storybible/`, `editor/`, …); API access goes through
  `src/services/api.ts`; generation orchestration lives in
  `src/composables/` (`useVolumeStoryGenerator`,
  `generation/runMechanics.ts`, `generation/evalBootstrap.ts`).
- Heavy derived state avoids re-creation: direct mutation of reactive
  arrays, pre-computed `Map` lookups in render loops, `Promise.all` for
  independent loads.

## Backend (`backend/`)

Clean Architecture, one solution (`Versatile.slnx`):

- `Versatile.Api` — 38 controllers, SignalR hubs
  (`/hubs/collaboration`, `/hubs/generation`), rate limiting (100/min
  global, 20/min embedding), exception handling (generic 500s),
  per-user response caching, Swagger (Development only).
- `Versatile.Application` — CQRS handlers, `PagedRequest`/`PagedResponse`
  (page size capped at 100), organization scoping.
- `Versatile.Domain` — entities; `Versatile.Infrastructure` — EF Core
  (`Npgsql`), JWT (`TokenGenerator`: 24h access, 7d refresh), Redis.
- **PostgreSQL with row-level security** enforces tenancy in the
  database, not just the app: cross-org reads return 404. Redis backs
  rate limits and cached endpoints (fail-closed only where safe —
  fail-open cache previously hid outages).
- No background-job server: upstream removed Hangfire; long AI work
  streams over SignalR instead.

## AI and generation

- **Five providers, two paths**: the browser calls providers directly
  with the user's own keys (`src/services/providers/`), while the server
  proxies only what must stay secret (Mistral embeddings) — keys never
  leave the server there (`GET /api/ApiKeys/{provider}` returns a masked
  hint).
- **Budgets and cache**: per-provider budgets (`aiProviderBudget.ts`,
  `modelBudget.ts`, `costTrackingStore`), response cache
  (`aiResponseCache.ts`), token calibration and context budgeting
  (`src/services/ai/`).
- **Director-first pipeline**: scene evaluation (`evalBootstrap.ts`,
  `evalStore`) → warn-only quality gates (malformed/CJK scan, tense
  consistency, payoff coverage in `evalGates.ts`/`chapterGate.ts`) →
  critic verdict (`criticVerdict.ts`) → continuity rules
  (`checkSeamContinuity`, `checkChapterSeam`) → manuscript assembly
  (`runMechanics.ts`). Gates warn, never silently discard prose.
- Reproducible locally: `tools/generate-sample.mjs` runs the pipeline
  against real Ollama models plus critic, gates and chapter acceptance.

## Deployment

`docker-compose.yml`: `postgres` (pgdata), `redis` (redisdata), `api`
(published `:5171`, health-checked, runs EF migrations except in
Testing), optional `frontend` profile (root `Dockerfile`: built SPA
served by nginx, `:8080`), optional `ollama` profile (default
`Ai__Ollama__BaseUrl` already points at it). Reverse-proxy, CORS and
config-driven origins are documented in the Phase 1 notes in
`planning/`.

## Security model (summary)

JWT (header; query-string only on `/hubs/*`) + organization claims +
PostgreSQL RLS; masked key reads; proxied embeddings; generic 500s;
per-user cache keys. Details and the deliberate no-antiforgery decision
are in `API.md`; the original findings in `planning/AUDIT-2026-09-07.md`.
