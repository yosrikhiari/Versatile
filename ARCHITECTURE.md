# Architecture

Versatile is a fiction-writing assistant: an offline-first Vue SPA for
manuscript work plus a .NET 10 API for identity, persistence, collaboration
and server-side AI. The full audit and remediation history lives in
`planning/`; API conventions in `API.md`; suites in `TESTING.md`; how a
generation run actually behaves in `docs/GENERATION-PIPELINE-ANALYSIS.md`.

## System map

```
browser (Vue 3 SPA, Dexie/IndexedDB v50) ──/api, /hubs──► .NET 10 API ──► PostgreSQL 16 (RLS)
        │ direct provider calls ▲                                       Redis (cache, rate limits)
        └───────────────────────────── 5 AI providers (openai, anthropic, gemini, groq, ollama)
```

## Frontend (`src/`)

- **Vue 3 Composition API + Pinia** (`src/stores/`, 23 stores with setup
  syntax): `projectStore` and `manuscriptStore` own the document graph;
  `storyBibleStore`, `storyGraphStore`, `volumeStore`, `branchStore` own
  world state; `settingsStore`/`authStore` own identity, keys and the
  `analysisTier`; `evalStore`, `costTrackingStore` own run telemetry.
- **Editor**: TipTap 3 (`BubbleMenu` from `@tiptap/vue-3/menus`) with
  autosave debounce and unmount flush — pinned by tests. Root-document
  typing pushes to the store on a 300 ms debounce and the watcher skips
  the editor's own echo (`docs/PERF-AUDIT.md`).
- **Offline-first**: Dexie 4 (`src/services/db-schema.ts` declares the
  41 schema versions; 26 `db-*.ts` table modules) is the source of truth
  in the browser. Writes are debounced and coalesced per entity; the three
  append-only history tables are deduped, throttled and capped; sync to the
  API replays in the background with bounded concurrency and self-heals
  (re-push PUT-updates instead of duplicating, stranded tables re-pushed).
- **Shell**: tool panels dock to the right of a canvas-dominant layout
  (`AppShell.vue`); the sidebar and the Ctrl+K palette share one panel
  definition; every panel is built from `src/components/ui/`
  (`BasePanelHeader`, `BaseSection`, …). Components are organized by
  domain (`storybible/`, `story/`, `editor/`, …); API access goes through
  `src/services/api.ts`.
- Heavy derived state avoids re-creation: direct mutation of reactive
  arrays, pre-computed `Map` lookups in render loops, `Promise.all` for
  independent loads.

## Backend (`backend/`)

Clean Architecture, one solution (`Versatile.slnx`):

- `Versatile.Api` — 38 controllers, SignalR hubs
  (`/hubs/collaboration`, `/hubs/generation`), rate limiting (100/min
  global, 20/min embedding), exception handling (generic 500s),
  per-user response caching, Swagger (Development only), `/health`.
- `Versatile.Application` — CQRS handlers, FluentValidation,
  `PagedRequest`/`PagedResponse` (page size capped at 100), organization
  scoping.
- `Versatile.Domain` — entities; `Versatile.Infrastructure` — EF Core
  (`Npgsql`), JWT (`TokenGenerator`: 24h access, 7d refresh), Redis,
  Serilog.
- **PostgreSQL with row-level security** enforces tenancy in the
  database, not just the app: cross-org reads return 403 (membership is
  checked before existence). Redis backs rate limits and cached endpoints
  (fail-closed only where safe — fail-open cache previously hid outages).
- No background-job server: upstream removed Hangfire; long AI work
  streams over SignalR instead.
- Four xUnit projects (`Api`, `Application`, `Infrastructure`,
  `IntegrationTests`); CI scans C# with SonarCloud and publishes the API
  image to GHCR on `master`.

## AI and generation

- **Five providers, two paths**: the browser calls providers directly
  with the user's own keys (`src/services/providers/`), while the server
  proxies only what must stay secret (Mistral embeddings) — keys never
  leave the server there (`GET /api/ApiKeys/{provider}` returns a masked
  hint). Ollama runs two models by default: an uncensored prose model and
  `qwen3:8b` for every grammar-bound "utility" call (planning, metadata,
  critic, spine) — `src/config/ollama.ts`.
- **Budgets and cache**: per-provider budgets (`aiProviderBudget.ts`,
  `modelBudget.ts`, `costTrackingStore`), response cache
  (`aiResponseCache.ts`), token calibration and context budgeting
  (`src/services/ai/`) — the old `MAX_CONTEXT_CHARS` constants are gone;
  retrieval reports the budget it actually enforces.
- **One orchestrator, three write strategies**. `useVolumeStoryGenerator`
  owns the phase machine (Delegator, no-bypass invariant), checkpoints
  and resume. The scene gate and the strategies live in
  `composables/generation/writing/`: `sceneGate.ts` (the gate rules, as
  `writeSceneWithGate` for the legacy paths and as the primitives
  `draftAttempt` / `critiqueAttempt` / `markGateOutcome` for the graph;
  `chapterLogBefore` so every critic call sees prior scenes),
  `batchStrategy.ts` (sequential, review-mode prefetch of scene *i+1*
  aware of scene *i*), `parallelStrategy.ts` (chapter anchors first, then
  middle scenes in bounded waves), and `graphStrategy.ts` — the
  **LangGraph multi-agent graph** (ADR-0001, `docs/adr/`): Writer and
  Critic as separate nodes on separate device lanes so the Critic judges
  scene *N* while the Writer drafts *N+1*; an **Editor** (`useStoryEditor`)
  deciding each superstep — a pure function in `workflow` mode, a model
  choosing among `legalMoves()` in `agentic` mode, validated and logged to
  `agentDecisions`; checkpoints per superstep in Dexie (`graph/dexieSaver.ts`,
  `graphCheckpoints`). Selected by `settings.orchestrator` (default
  `legacy`). Chapter mode (`useChapterStoryGenerator`) and arc mode share
  `useGenerationRunController` + `GenerationRunView`.
- **Role placement** (`src/config/roles.ts`): each agent role — director,
  writer, critic, editor, utility — names a model and a device. `aiService`
  resolves the model and the semaphore lane (`ollama:gpu` / `ollama:cpu`,
  `providerGate.ts`) from it and forwards `num_gpu` / `keep_alive` /
  `num_ctx` to Ollama. The one hard rule, measured on the 8 GB reference
  GPU: one distinct GPU model per run, because a second one evicts the
  first and every switch reloads from disk (12–18 s). The multi-agent
  preset keeps Writer and Director on the GPU prose model and runs the
  Critic and Editor on a small CPU model, so the judge is not the author
  and nothing swaps.
- **Tracing through AgentOps** (`src/config/agentops.ts`, off by default):
  the Ollama provider keeps its request path — stall detection, first-token
  budget, partial-output salvage — and swaps only the transport
  (`providers/agentopsTransport.ts`): `POST <gateway>/v1/chat/completions`
  streamed as SSE instead of Ollama's NDJSON `/api/generate`. Every call
  carries `X-Agent-Role` and `X-Client-Ref` (`<run>/<step>/<role>`, set per
  superstep by the graph through `services/traceContext.ts`), the gateway
  forwards `options` / `format` / `keep_alive` / `think` (AgentOps v1.1,
  ADR-0009 there) and records their values — never the prompt, never the
  schema — on the `model.generate` span, and answers `X-Trace-ID`, which the
  transport reports back so the Agents panel lists each call's trace with a
  link into the Tower inspector. Every placed model must be registered on
  the gateway (`OLLAMA_MODELS`); the transport names that fix when the
  gateway answers `unknown_model`.
- **Run contract**: gates warn, never silently discard prose. A scene
  that fails the gate after `SCENE_MAX_ATTEMPTS` is committed as its best
  attempt with `contentStatus: 'review'` and a `gate_failed` health event;
  a quality-floor breach records rather than errors; `runHealth.ts` counts
  every degradation and the end-of-run invariants (`bible_static`,
  degraded rate, …) must hold. The chapter gate (`chapterGate.ts`) judges
  the whole chapter once every scene exists.
- **Digest layer** (schema v44–v47): `CommitService` writes a scene
  digest at commit time; `digestRollup.ts` builds chapter and volume
  digests; `entityStates` is the entity-state timeline; `graphEdges`
  carry a validity window and the `runId` that asserted them.
  `deterministicContradictions.ts` + `crossChapterRules.ts` run before
  any LLM call, and `detectContradictions` is a tree traversal (Pass 1 per
  chapter, Pass 2 cross-chapter, volume drift rules). Chapter-boundary
  audits scope to entities the new chapter touches; fix rounds recheck
  only flagged entities. `analysisQueue` (v46) makes the backfill
  persistent and idle-priority.
- **Cloud tier** (opt-in): `analysisTier` (`local` default /
  `cloud-on-demand` / `cloud-audit`) plus a per-project `cloudAuditOptIn`.
  Contradiction, arc and repetition passes have an injectable JSON
  generator seam; when routed to the cloud they go through the API's
  `GenerationHub` with a pre-upload disclosure (`cloudEscalation.ts`) and a
  budget-guarded batch injector that falls back to local. A suspect or
  unavailable local critic verdict can auto-request a second opinion.
- **Retrieval**: IVF vector index (`vectorIndex.ts`) with k-means++
  clustering, searched off-thread (`vectorIndex.worker.ts`) and
  brute-force fallback; research reindex swaps atomically.
- **Reproducible locally**: `tools/generate-sample.mjs` runs a 2-scene
  sample against real Ollama models plus critic, gates and chapter
  acceptance; `vitest.live.config.js` + `src/tests/live/` run a whole
  book headless under fake-indexeddb and stream progress to
  `reports/live/<slug>/`.

## Deployment

`docker-compose.yml`: `postgres` (pgdata), `redis` (redisdata), `api`
(published `:5171`, health-checked, runs EF migrations except in
Testing, fails fast without `JWT_KEY` / `ENCRYPTION_MASTER_KEY`),
optional `frontend` profile (root `Dockerfile`: built SPA served by nginx
on `:8080`, proxying `/api`, `/hubs` and `/health` same-origin), optional
`ollama` profile (default `Ai__Ollama__BaseUrl` already points at it).
Details in `docs/DEPLOYMENT.md`.

## Security model (summary)

JWT (header; query-string only on `/hubs/*`) + organization claims +
PostgreSQL RLS; masked key reads; proxied embeddings; generic 500s;
per-user cache keys; DOMPurify-backed `sanitizeHtml` for any future
`v-html` sink. Details and the deliberate no-antiforgery decision are in
`API.md`.
