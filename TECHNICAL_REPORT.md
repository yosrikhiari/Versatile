# Versatile — Technical Report

> Grounded in a first-hand read of the source (schema, AI service, providers, stores,
> composables, components, .NET backend, config, and tests), not on the repo's own docs —
> several of which are stale (noted inline). Line counts and paths are from the working tree
> at the time of writing.

---

## 1. Executive Summary

**Versatile is a browser-based, offline-first fiction-writing environment that pairs a distraction-free rich-text editor with a multi-agent AI pipeline that can draft an entire novel** — planning a story bible and relationship network, outlining volumes/chapters/scenes, generating prose scene-by-scene, and auditing the result for continuity. All creative data lives locally in IndexedDB, and AI runs against a local Ollama server by default (with OpenAI/Anthropic/Gemini/Groq as opt-in cloud providers). An optional .NET 10 backend adds accounts and cross-device cloud sync, but the app is fully functional without ever logging in.

The target user (per `MARKET_ANALYSIS.md`) is the **"sovereignty-seeking" self-published fiction author** — privacy-conscious, technically inclined, and averse to subscription lock-in. The problem it solves is that the leading AI writing tools (Sudowrite, Novelcrafter) are cloud-only, subscription-based, and send your manuscript to a vendor. Versatile's wager is local-first drafting with your own local model, plus a genuinely autonomous "generate a coherent draft" pipeline rather than sentence-level autocomplete.

It is a large, real codebase: **~52k LOC of frontend** (79 Vue components, ~55 composables, 15 Pinia stores, ~55 service modules) and **~16k LOC of a .NET 10 Clean-Architecture backend**. It is mostly the work of a solo developer and shows the corresponding profile: an ambitious, mostly-complete pipeline with strong logic-layer test coverage alongside real tech-debt seams (a stale abandoned TS migration, committed secrets, a large "god composable").

---

## 2. Tech Stack

### Frontend

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Vue 3** (Composition API, `<script setup>`) | All 79 `.vue` files use `<script setup>` in JS |
| Build | **Vite 5** | `@` → `src` alias; custom dev-only debug-snapshot middleware |
| State | **Pinia 2** | 15 setup-style stores; no persistence plugin |
| Persistence | **Dexie 3 / IndexedDB** | DB `VersatileDB`, schema at **v31** (~39 tables) |
| Rich text | **Tiptap 2 (ProseMirror)** | Exactly one editor instance; one custom extension |
| Graph UI | **Vue Flow 1.x** (`core`, `background`, `minimap`, `controls`) | Powers the story relationship network |
| Styling | **Tailwind 3** | `darkMode: 'class'`; design tokens as `--vers-*` CSS vars |
| Language | **JavaScript** with a thin **TypeScript** seam | 158 JS + 79 Vue vs 17 TS files; `vue-tsc` typecheck |
| Testing | **Vitest + jsdom + @vue/test-utils** | `fake-indexeddb`; LLM calls always mocked |

**Key third-party libraries and why:** `dexie` (IndexedDB is the primary datastore — offline-first); `@tiptap/*` (ProseMirror-based editor with a custom dialogue-highlight extension); `@vue-flow/*` (the interactive entity graph); `@vueuse/core` (`useDebounceFn`, `useLocalStorage` throughout); `jspdf` + `jspdf-autotable` + `html2canvas` (PDF export); `pdfjs-dist` (extracting text from imported research PDFs); `vuedraggable` (chapter/scene reordering); `focus-trap` (modal accessibility); `lucide-vue-next` (icons, referenced by name in workspace config); `@fontsource-variable/geist` (self-hosted UI font). `playwright` is a dev dependency but no meaningful E2E suite was found.

### Backend (optional)

.NET 10 ASP.NET Core Web API, **Clean Architecture** (`Domain` → `Application` → `Infrastructure` → `Api`). **PostgreSQL** via **Npgsql + EF Core 10**, `Pgvector` referenced for embeddings. **MediatR 12** + **FluentValidation 12** (CQRS — but only partially adopted), **JWT bearer auth** (custom, not ASP.NET Identity), **SignalR** hubs, **Serilog**, and the official **OpenAI 2.11** SDK (the backend is itself a second LLM caller).

### How frontend and backend communicate

The frontend is **offline-first**; the backend is a **dormant, opt-in sync target**. Vite proxies `/api → localhost:5171`, `/ollama → localhost:11434`, and `/sdapi → 127.0.0.1:7860` (Stable Diffusion / AUTOMATIC1111 for character portraits). `src/services/api.js` is a REST client (Bearer token with automatic refresh-on-401). `src/services/sync-engine.js` only activates `if (hasToken())` — i.e. once the user logs in — otherwise every sync operation early-returns. Notably, **the two SignalR hubs have no frontend client** (`@microsoft/signalr` / `HubConnection` appear nowhere in `src/`); real-time collaboration and server-side streaming generation exist server-side but are currently unused by this frontend, which does its own client-side LLM streaming.

---

## 3. Architecture Overview

### 3.1 High-level layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│  BROWSER (Vue 3 SPA — offline-first)                                        │
│                                                                            │
│  Views (3 routes)         LoginView · WorkspaceView · EditorView           │
│        │                  (auth guard via authStore.isAuthenticated)       │
│        ▼                                                                    │
│  AppShell.vue  ──slot-driven panels──► StoryGenerator · StoryBible ·       │
│   (one editor + ~13 slide-in panels; NOT route-driven)  Network · Polish · │
│        │                                                Research · Eval …   │
│        ▼                                                                    │
│  Pinia stores (15)   project · manuscript · storyBible · storyGraph ·      │
│        │              flow · polish · spark · settings · auth · …          │
│        ▼                                                                    │
│  Composables (~55)   ┌─ useNovelPipeline (DAG facade)                       │
│        │             └─ useVolumeStoryGenerator (2330-line engine)          │
│        │                  ├─ useStoryDirector  (plan)                       │
│        │                  ├─ useStoryWriter    (prose + structured entities)│
│        │                  ├─ useStoryCritic    (score + continuity audit)   │
│        │                  ├─ useEntityBootstrapper (bible + canon lock)     │
│        │                  └─ generation/  (context→shape→prompt→run)        │
│        ▼                                                                    │
│  Services (~55)      aiService.ts (provider dispatch) · db-*.js (Dexie CRUD)│
│        │             embeddingService · documentChunker.worker · sync-engine│
│        ▼                                                                    │
│  ┌──────────────┐   ┌───────────────────────────────────────────────┐      │
│  │ IndexedDB     │   │ providerRegistry → OpenAI/Anthropic/Gemini/    │      │
│  │ (Dexie v31)   │   │ Groq/Ollama modules   (retry+backoff+fallback) │      │
│  └──────────────┘   └───────────────────────────────────────────────┘      │
└───────┬───────────────────────┬───────────────────────────┬────────────────┘
        │ /ollama (proxy)        │ /sdapi (proxy)            │ /api (proxy, ONLY if logged in)
        ▼                        ▼                           ▼
   Ollama :11434           Stable Diffusion :7860     .NET 10 API :5171
   (LLM + embeddings)      (portraits)                 ├─ JWT auth, API-key vault (AES-GCM)
                                                        ├─ EF Core → PostgreSQL (34 DbSets)
                                                        ├─ MediatR (Story/Auth only)
                                                        ├─ SignalR hubs (no FE client)
                                                        └─ OpenAI SDK (backend-side gen)
```

The **single most important architectural fact**: page routing is trivial (3 routes), but the workspace itself is a **single-page shell with slot-driven panels**. `AppShell.vue` holds one `activePanelName` ref that transitions a stack of docked `<aside>` panels around a permanent center `<main>` editor. Feature "screens" are panels, not routes.

### 3.2 Directory-by-directory

**Frontend `src/`:**
- `views/` (3) — `LoginView`, `WorkspaceView` (project picker), `EditorView` (532 lines; wires ~30 components + composables and fills AppShell's slots).
- `components/` (79 across 20 feature dirs) — `layout/` (shell, settings, onboarding), `flow/` (the Tiptap editor + flow-mode timer/nudge), `manuscript/` (chapters/sections/outline/canvas/timeline), `storybible/` (entities + the Vue Flow network), `story/` (the generation panel), `spark/` (brainstorm), `polish/` (prose critique), `revise/`, `research/`, `eval/` (quality dashboards), `storyshape/` (tension curves), `voice-lab/`, `volume/`, `characterchat/`, `editor/` (floating character bubbles), `auth/`, `shared/` (15 primitives), `ui/` (atoms).
- `composables/` (~55) — reusable stateful logic; `generation/` holds the clean four-stage entity mini-pipeline (`context/`, `shaping/`, `pipeline/`, `schemas/`, `generators/`); the top-level `useStory*`/`useVolumeStoryGenerator`/`useNovelPipeline` hold the novel pipeline.
- `services/` (~55) — persistence (`db-*.js`, one module per table group), the AI provider layer (`aiService.ts`, `providerRegistry.ts`, `providers/*`), embeddings, chunking (main + web worker), sync (`sync-engine.js`, `sync-mapper.js`), export, portraits.
- `stores/` (15) — Pinia state per domain (see §6).
- `config/` (13) — provider/feature registry, workspace terminology (16 types), evaluation rubrics, prompt sets, voice profiles, blueprints, storage keys.
- `evaluation/` — RAG/IR metrics (separate from AI grading).
- `extensions/` — the single Tiptap `AutoDialogue` plugin.
- `utils/` (8) — pure helpers (dialogue detection, network layout math, hashing, text).
- `types/` — TS interfaces for the AI seam.

**Backend `backend/`** (Clean Architecture): `Versatile.Domain/Entities` (36 entity classes), `Versatile.Application` (MediatR commands/queries/handlers/validators for Story+Auth, service interfaces, DTOs), `Versatile.Infrastructure` (EF Core `ApplicationDbContext`, repositories, concrete services, middleware), `Versatile.Api` (41 controllers, 2 SignalR hubs, 3 migrations, `Program.cs`), `Versatile.Api.Tests` (xUnit).

### 3.3 Data flow — a typical user action

**"Write the next scene" (autonomous generation):**
1. User configures a run in `StoryGeneratorPanel.vue` (Arc/Chapter/Scene tab) and clicks generate → `handleVolumeGenerate` calls `useVolumeStoryGenerator.startGeneration()`.
2. **bible** stage: `useEntityBootstrapper.bootstrapEntities()` fills characters/locations/plot threads to minimums via `aiGenerateJson` (schema-constrained), respecting canon-lock on approved entities; batch-inserts atomically (`db-entities.js`).
3. **network** stage: `generation/generators/relationships.js` builds typed relationship edges.
4. **structure** stage: `useStoryDirector.generateStoryPlan()` produces chapters/scenes (streamed); user reviews in the plan-preview; `confirmPlan()` materializes sections/subsections via `batchCreatePlanStructure` (transactional).
5. **spine** stage: `generateSpine()` builds per-chapter continuity spines (with `fallbackSpineEntry` on failure).
6. **prose** stage: `runParallelGeneration` (anchors-first, then middles) or the sequential `writeNextBatch`; each scene → `useStoryWriter.writeSceneStructured()` streams prose live into the panel, emits structured `{prose, usedEntities, newEntities, networkEvents, keyFacts}`; `useStoryCritic.evaluateScene()` scores it against workspace rubrics; best-of-N attempts kept.
7. Prose is persisted to the `subsections` Dexie table (`contentStatus` set); a prose-less checkpoint is written to `genRuns` after each scene for crash-safe resume.
8. **consistency** stage: `buildFactLedger()` accumulates canon; `critic.checkContradictions()` audits; a bounded auto-fix loop rewrites offending scenes.
9. If logged in, the Dexie `creating`/`updating` hooks tag rows `pending-create`/`pending-update`; the 30s sync flush (or `syncNow()`) pushes them to `/api`.

**"Type in the editor" (the hot path):** keystroke → Tiptap `onUpdate` passes ProseMirror's `state.doc.textContent` straight to `projectStore.updateContent` (avoids HTML serialization for word count) → full HTML save is debounced 10s to the correct store (subsection/section/project) → snapshot + dialogue reindex fire in the background.

---

## 4. Core Domain Concepts

The domain is a **novel decomposed into a structural tree plus a knowledge graph**.

**Structural spine:**
- **Project** — the workspace entry / active creative work (overloaded term; `projectStore` is workspace-level state). Maps to backend **Story**.
- **Volume** — a book-level subdivision grouping chapters (and, in the graph, entities that co-occur).
- **Section** — a chapter-like unit (the current name; **legacy `chapters` table** still exists post-v13 rename but is unused by new code).
- **Subsection** — a scene-like unit with prose, POV, and a `contentStatus` (draft/generated/authored/failed). (Legacy: `scenes`.)
- **Manuscript** — the flat rich-text body (used when not split into sections).

**Story-bible entities (graph nodes):**
- **Character** (with `generationStatus`, portrait, voice), **Location**, **Plot Thread**, and generic **Item/Entity** — each has a `generationStatus` (pending/generated/approved) so the pipeline can distinguish AI-generated from hand-authored canon.
- **Relationship / Graph Edge** — a typed edge between nodes: 13 character-character types (loves, hates, married, mentor, rival…), 4 cross-entity (owns, locatedAt, appearsIn, memberOf), plus group edges (contains). **Graph Group** — a manual or per-volume container node.

**AI pipeline roles (personas):**
- **Director** (plans structure), **Writer** (drafts prose + extracts entities/facts), **Critic** (scores + audits continuity), **Revisor** (present but **not wired** — revision is done inline), **Bootstrapper** (fills the bible), **Researcher** (present, not on the live path).

**Supporting concepts:** **Workspace type** (16 defined, only 3 creative ones shipped — remaps terminology, e.g. "Characters"→"Parties" for legal); **Voice Profile** (statistical author-style fingerprint); **Blueprint** (story-structure template); **Flow Session** (a timed writing sprint); **Eval Dimension / Gate** (quality scoring); **Research Document / Chunk** (imported reference material, embedded for retrieval); **genRun** (a resumable generation checkpoint).

**Relationships:** `Project → Volume → Section → Subsection → (prose)`. `Project → {Characters, Locations, PlotThreads}` which are the nodes of a `GraphEdge` network. `Volume ⇄ Entity` is many-to-many via `volumeEntities`. Scenes reference the entities they use; the fact ledger threads canon across scenes.

---

## 5. Key Subsystems (deep dive)

### 5.1 The autonomous novel-generation pipeline ⭐ (the heart of the app)

**What it does:** turns a premise into a coherent multi-chapter draft through a fixed DAG: **bible → network → structure → spine → prose → consistency** (`PIPELINE_DAG`, `useNovelPipeline.js:16`; `PIPELINE_STAGES`, `db-generation.js:5`).

**Files:** `useNovelPipeline.js` (133 lines — a thin declarative facade) delegates to `useVolumeStoryGenerator.js` (**2330 lines — the real engine**), which orchestrates `useStoryDirector.js` (627), `useStoryWriter.js` (589), `useStoryCritic.js` (321), and `useEntityBootstrapper.js` (382). The cleaner per-entity generator lives under `composables/generation/`.

**How triggered:** from `StoryGeneratorPanel.vue` via `startGeneration()` (`:790`) → `confirmPlan()` (`:1603`) → `completeGeneration()` (`:1947`). An `autoMode` flag auto-advances every human-review gate.

**Design patterns:**
- **Persona/agent decomposition** (Director/Writer/Critic).
- **Facade over god-object** — `useNovelPipeline` is a clean DAG interface; all real logic is the 2330-line engine (~30 closures over ~20 refs).
- **Degrade-and-continue as a first-class principle** — every model call has a plan-derived fallback (`fallbackSpineEntry` `:153`; `planChunked` pads missing chapters/scenes; network failure is caught and the run continues). No single scene aborts a 100-chapter run.
- **Bounded, provider-aware concurrency** — `parallelWithLimit`, `planConcurrency()` returns 1 for Ollama vs 3–4 for cloud, so local models aren't swamped.
- **Two-phase prose** — chapter anchors (opening/closing) generated in parallel first, then middles fill between locked endpoints.
- **Crash-safe resume** — `persistCheckpoint()` writes a prose-less checkpoint after each scene; `resumeGeneration()` rebuilds from DB truth (existing prose), stops at the first empty scene, and never overwrites written work.

**Fact ledger & canon lock** — `buildFactLedger(spine, writtenScenes)` (`:57`) accumulates durable canon (deaths, injuries, who-knows-what), preferring the Writer's *actual* emitted `keyFacts` over the *planned* ones. It feeds `critic.checkContradictions()` (`useStoryCritic.js:226`), which audits every entity appearing in ≥2 scenes for contradictions (alive-after-death, two-places-at-once). Hand-authored/approved entities are frozen via `canonLocked`/`generationStatus==='approved'` (`useEntityBootstrapper.js:243`) — the bootstrapper may gap-fill empty fields but never overwrite them.

**Error taxonomy** (STATUS.md, verified in code): **transient** (network/5xx/timeout) → retry with backoff; **permanent** (401/bad key/missing model) → abort the stage, keep committed work; **content** (bad JSON/empty prose) → bounded repair → degrade → mark `failed`. Constants: `SCENE_MAX_ATTEMPTS = 2`, quality-floor abort at `QUALITY_FLOOR_CONSECUTIVE = 3`, `repairFailedScenes()` as an end-of-run best-effort pass.

**Trade-offs / notable:** the Critic deliberately returns `evalUnavailable: true` instead of a fake passing 7 when it can't parse, so quality averages aren't poisoned. But the engine carries real redundancy — **two parallel write paths** (`runParallelGeneration` vs `writeNextBatch`), a **dead Revisor** while revision is reimplemented inline, and **recursion in `writeNextBatch`** (depth = ⌈scenes/3⌉, flagged in-code at `:1586`). Streaming parsers are hand-rolled state machines to avoid O(n²) rescans; several `// Fix #N` comments memorialize past perf/correctness bugs.

### 5.2 The unified AI provider layer

**What it does:** one interface over 5 providers with retries, fallback, and structured (JSON) output. **Files:** `aiService.ts` (247), `providerRegistry.ts`, `config/ai.ts` (138), `providers/{ollama,openai,anthropic,gemini,groq}.js`, wrapped store-aware by `composables/useAiService.ts` (which every generation module actually imports).

**Pattern:** module-map dispatch (not classes) — each provider is a flat module exporting `generate/stream/testConnection` and optionally `generateStructured`. `resolveFeatureConfig(feature, options)` picks `{provider, model}` from per-feature overrides → global default → `PROVIDER_DEFAULT` (Ollama). Calls are wrapped in `withRetry` (`retryService.ts`: exponential backoff + jitter, retryable-by-regex on the message, 4 retries default). On terminal failure, `tryFallbackProvider` retries once against a configured secondary.

**Structured output** (`aiGenerateStructured`) is two-tier: native schema-constrained decoding when available (**Anthropic forced tool-use** → validated `tool_use.input`; **OpenAI `json_schema`**; **Ollama `format`**), otherwise a hard "ONLY valid JSON" directive + `sanitizeJson` (strip fences, regex-extract `{…}`, parse). Gemini and Groq have no native path and always take the fallback.

**Trade-offs:** clean and testable (every provider is unit-tested); but each adapter re-implements SSE/timeout handling slightly differently (gemini has *no* internal timeout; groq inlines its own abort logic), and the fallback JSON path is regex-fragile by nature.

### 5.3 Persistence + offline-first cloud sync

**What it does:** IndexedDB is the source of truth; the backend is an optional mirror. **Files:** `db-core.js` (schema, 31 versions), `db-structure.js`/`db-entities.js`/`db-graph.js`/… (per-table CRUD + atomic batch inserts), `sync-engine.js` (387), `sync-mapper.js` (404), `api.js` (207).

**Pattern:** Dexie table hooks stamp `syncStatus` (`pending-create`/`pending-update`) on every local write and record deletions into a `pendingDeletions` table. The `SyncEngine` singleton maintains a local↔API id map, pushes in dependency order (projects → volumes → characters → … → manuscripts), then pulls. **Conflict handling is last-write-wins with local-dirty protection**: a pull skips any local row whose `syncStatus !== 'synced'`. A 30s flush timer pushes; `syncNow()` runs push-then-pull on login. Every op is wrapped in a 3-attempt retry and per-row error isolation (a bad row never aborts the batch). `sync-mapper.js` holds per-entity `toApi`/`fromApi` transformers (characters/locations collapse to a generic `/entity` endpoint with a JSON `metadata` blob; FKs are translated via the id map, defaulting to a zero-UUID when unresolved — a latent data-integrity risk).

**Schema reality:** DB is at **v31** with ~39 tables. The v13 chapters→sections rename kept both tables (never dropped). v22 added the entire sync column set. v31 added `generationStatus`/`contentStatus` for the pipeline. `ready()` auto-recovers a corrupt DB by deleting and reloading (once).

### 5.4 The evaluation subsystem (LLM-as-judge + deterministic gates)

**What it does:** grades generated scenes and guards against degenerate grading. **Files:** `config/evalDimensions.js` (468 — 22 rubrics across 6 workspace dimension sets, 1–10 scales), `useStoryCritic.js` (the AI grader), `services/evalGates.js` (118 — deterministic meta-checks), `config/evalGateConfig.js`, `composables/useSceneEval.js` (226 — orchestrator), `services/degradation.js`, `components/eval/EvalDashboard.vue` (365 — read-only dashboard).

**Pattern:** the Critic is an **LLM-as-judge** producing `{score, pass, dimensionScores, issues[], strengths[]}`. On top sit three **deterministic gates**: `gateDimensionCoverage` (dimensions with no issues), `gateScoreDistribution` (out-of-range, suspiciously-exactly-7, high-score-with-major-issues), and `gateRevisionEffectiveness` (unchanged revisions, >15% word drift, score regressions — `failOn: 'block'`). Separately, `src/evaluation/` holds a **classic IR benchmark** (`ragMetrics.js`: hit-rate, MRR, nDCG@k, recall@k) for the retrieval system — a genuinely nice piece of engineering discipline.

### 5.5 Embeddings & semantic retrieval

**What it does:** context selection for long stories + research retrieval. **Files:** `embeddingService.js`, `embeddingQueue.js`, `documentChunker.worker.js` (569 — off-main-thread semantic chunking), `useSemanticChunking.js`, plus `buildRetrievalContext` in the generator.

Below 25 scenes the generator uses cheap prose excerpts; **at ≥25 scenes it switches to embedding-similarity retrieval** — embeds a query from the scene's goal/characters/location, cosine-ranks prior scene summaries, takes top-k, and always pins the immediately preceding scene's ending as a local anchor. Embeddings come from Ollama or Mistral, cached persistently in the `embeddingCache` Dexie table (sha256-keyed) with an in-memory LRU on top. `VERDICT.md` documents a real performance pass here (concurrent sub-batching, input dedup). The chunker runs in a **Web Worker** with a graceful inline fallback when `Worker` is undefined (tests/SSR).

---

## 6. State & Data Management

**Client state:** 15 Pinia setup-stores, none using a persistence plugin — persistence is delegated to the `db-*` service layer (the one exception is `authStore`, which touches `db.users` directly). Small UI prefs go to `localStorage` via `useLocalStorage`.

| Store | ~Lines | Depth | Role |
|---|---|---|---|
| `projectStore` | 310 | deep (hub) | active project, word counts, goals, streaks, document content, author voice |
| `manuscriptStore` | 263 | shallow-ish | sections/subsections/storyElements/relationships CRUD (optimistic) |
| `storyBibleStore` | 308 | deep | characters/locations/plotThreads; cascade deletes, atomic batch inserts, debounced doc regen |
| `storyGraphStore` | 283 | deep | edges/positions/node-instances/groups; position pruning, legacy-edge merge |
| `volumeStoryNetworkStore` | 208 | medium | per-volume entity/edge caches |
| `volumeStore` | 127 | medium | volumes + section assignment (`chapterIds`→`sectionIds` migration) |
| `flowStore` | 232 | deep | writing-sprint timer, idle detection, backspace nudge (Web Audio) |
| `polishStore` | 195 | deep | annotation CRUD, 800ms-debounced paragraph analysis |
| `spark`Store | 225 | deep | brainstorm/outline/content AI orchestration |
| `settingsStore` | 308 | deep | provider/model config, per-feature overrides, encrypted key storage |
| `authStore` | 199 | deep | dual cloud (JWT) + offline-local accounts; boots the sync engine |
| `characterChatStore` | 270 | deep | character role-play sessions, debounced streaming persistence |
| `bubbleStore` | 178 | deep | floating character bubbles (dedup/orphan logic) |
| `archiveStore` / `snapshotStore` | 105 / 90 | medium | session history + manuscript snapshots |

There is **no single god store** — `projectStore` is the closest hub but stays ~310 lines. Cross-store coupling is real but handled with three deliberate circular-dependency workarounds: **lazy `await import()`** (projectStore→manuscriptStore), **static import called only inside a timeout** (manuscriptStore→projectStore), and **runtime injection** (`polishStore.setProjectStore`). An ESLint `no-restricted-imports` rule enforces the boundary that services must not import stores and stores must not import composables (as warnings).

**Persistence:** IndexedDB (Dexie `VersatileDB`, v31, ~39 tables) is primary; `localStorage` for prefs, encrypted API keys, and a couple of id bridges; the PostgreSQL backend is the optional sync mirror (34 EF Core `DbSets`). A field-name mapping layer exists between store and DB (`projectStore.currentCategory` ⇄ `projects.genre`, `currentDescription` ⇄ `synopsis`) — a small but real source of confusion.

---

## 7. External Integrations

| Service | Purpose | How reached | Failure handling |
|---|---|---|---|
| **Ollama** (`:11434`) | Default local LLM + embeddings | Vite proxy `/ollama` | AI features auto-disable when unreachable; `ensureModelAvailable()` returns actionable "pull it first" errors; GPU/CUDA errors rewritten (`decorateOllamaError`) |
| **OpenAI / Anthropic / Gemini / Groq** | Opt-in cloud LLMs | Direct HTTPS from browser with user key | Per-provider retry; cross-provider fallback; missing-key throws a settings prompt |
| **Mistral** | Embeddings (`mistral-embed`) | Direct HTTPS | Falls back to Ollama embeddings, then to prose-excerpt context |
| **Stable Diffusion** (AUTOMATIC1111, `:7860`) | Character portraits | Vite proxy `/sdapi` | Prompt gen falls back to a template if the LLM call fails |
| **.NET backend** (`:5171`) | Accounts, cloud sync, encrypted key vault, backend-side OpenAI generation | Vite proxy `/api`, Bearer token | Entire sync layer no-ops without a token; auto-refresh on 401; per-row error isolation |

**Resilience posture:** the app is designed to degrade to a fully-local, no-cloud experience. The retry/fallback story is genuinely layered (transport retry → provider fallback → content-repair → degrade-and-continue → quality-floor abort).

⚠️ **A live Mistral API key is committed in `.env`** (`VITE_MISTRAL_API_KEY=SwxwH1x…`), and because it's a `VITE_` var it is also **bundled into the client**. This should be rotated and moved server-side.

---

## 8. Code Quality Observations

### Strengths
- **The AI abstraction is clean and well-tested** — module-map dispatch, a single retry/fallback seam, native-structured-output-with-graceful-fallback, and every provider adapter has unit tests.
- **Disciplined resilience** — degrade-and-continue, crash-safe checkpoint/resume from DB truth, atomic batch inserts, DB auto-recovery, and an honest Critic that refuses to fabricate scores.
- **Real evaluation engineering** — both LLM-as-judge with deterministic anti-degeneracy gates *and* a classic IR benchmark (MRR/nDCG) for retrieval quality.
- **Strong logic-layer test coverage** — **113 test files** (STATUS.md's 107 is stale; I did not run the suite so can't confirm the "1092 tests" count). Providers, the Dexie layer, stores, most composables, config, and the eval subsystem are well covered; LLMs are always mocked and `fake-indexeddb` backs the DB tests.
- **Architectural boundaries are codified** — ESLint import restrictions, a custom design-token linter (`scripts/lint-tokens.mjs`), and CSS-variable design tokens.
- **Performance-conscious hot path** — ProseMirror `textContent` for word counts, 10s-debounced HTML saves, O(1) paragraph resolution, hand-rolled streaming parsers to avoid O(n²).

### Risks / smells
- **Abandoned TypeScript migration (real dead code).** Five composables exist as *both* `.js` and `.ts` (`useStoryWriter`, `useStoryCritic`, `useStoryDirector`, `useStoryRevisor`, `useAiService`). Extensionless imports resolve `.js` first, so the **`.ts` copies are stale, superseded duplicates** — a live trap for anyone who edits the wrong file. ARCHITECTURE.md even claims "No TypeScript," which is false.
- **A 2330-line god composable** (`useVolumeStoryGenerator.js`) with two parallel write engines, a dead Revisor, and recursion the author already flagged for refactor.
- **Committed secrets** — the Mistral key (above), plus the backend's dev `Jwt:Key` and `Encryption:MasterKey` in `appsettings.json`, and a hardcoded test-user password hash in `db-core.js` (correctly gated behind `DEV_MODE=false`, but present).
- **Very large components** — `StoryNetwork.vue` (2413), `StoryGeneratorPanel.vue` (1544, mid-refactor per STATUS.md), `StoryBiblePanel.vue` (1384), `ChapterManager.vue` (823).
- **Documentation drift** — README says Dexie v16 (actually v31); CONTEXT.md says v11 and describes a retired `useStoryOrchestrator`; ARCHITECTURE.md says "13 stores / no TypeScript" (15 stores, TS present). STATUS.md is the one trustworthy doc.
- **Dead server features** — the two SignalR hubs have no frontend client; backend CQRS is applied to only Story/Auth (the other ~40 features use plain services); backend refresh tokens are stored in plaintext while API keys are AES-GCM encrypted; rate limiting is per-process in-memory.
- **Repo hygiene** — many scratch files at root (`vite_out.txt`, `backend_stdout.txt`, `perm_check.txt`, `package-lock.json.tmp`, `dir_check.txt`, `debug/`).

### Test coverage: what isn't tested
Components (79 `.vue` files) are almost entirely untested — the first component mount tests were only just added for the `StoryGeneratorPanel` split. Integration coverage is thin (2 files, one named `example`). STATUS.md explicitly flags the bootstrapper commit loop and the streaming active-generation UI as needing runtime smoke tests. The backend tests cover only security middleware + crypto + AI prompt logic (4 files); controllers, MediatR handlers, repositories, and hubs are untested.

---

## 9. Areas of Complexity

**The single most complex module is `src/composables/useVolumeStoryGenerator.js` (2330 lines).** It is the entire novel-generation engine: bootstrapping, planning, spine, parallel + sequential prose generation, per-scene critique with best-of-N retry, embedding retrieval, fact-ledger construction, contradiction auditing with a bounded auto-fix loop, checkpoint/resume, and end-of-run repair — all as ~30 closures sharing ~20 module-level refs. It is powerful and, impressively, largely works, but it is very hard to test or modify in isolation.

Runner-up: **`StoryNetwork.vue` (2413 lines)** — it hand-rolls multi-instance graph nodes (one entity can appear many times, with edge fan-out and stagger offsets), nested manual groups with mouse-driven resize and cycle-safe reparenting, per-volume auto-grouping, a ~300-line radial "star" auto-layout, custom bezier edges with HTML labels, and an AI-suggestion flow — all on top of Vue Flow.

**Non-obvious "clever" logic a new engineer should be warned about:**
- **`.js` beats `.ts`.** If you edit `useStoryWriter.ts` and nothing changes, that's why — imports resolve to the `.js` file. Delete the `.ts` duplicates or finish the migration; don't trust them.
- **The Critic returns `evalUnavailable`, not a 7.** Any code averaging scores must handle `score: null` — this is intentional and load-bearing.
- **Resume reads DB truth, not a counter.** Never "fix" `resumeGeneration` to trust the scene index; it deliberately stops at the first empty subsection and refuses to overwrite existing prose.
- **Canon lock silently refuses writes.** The bootstrapper will *not* overwrite fields on an approved/locked entity — it only gap-fills. If a generated value "won't stick," the entity is locked.
- **The 25-scene retrieval cliff.** Context strategy silently switches from prose-excerpt to embedding-similarity at `PROSE_EXCERPT_MAX_SCENES = 25`; behavior (and Ollama/Mistral dependency) changes for long stories.
- **`chapterIds`/`sectionIds` and `chapters`/`scenes`.** The v13 rename left legacy tables and a `chapterIds` field on volumes; `db.on('ready')` even seeds a Default volume with a `sectionIds` field the table doesn't index. Tread carefully around volume/section assignment.

---

## 10. Suggested Next Steps

Prioritized for impact:

1. **Rotate and remove committed secrets** (highest urgency, lowest effort). Rotate the Mistral key, move it server-side (it's currently bundled into the client via `VITE_`), and replace the backend's committed `Jwt:Key`/`Encryption:MasterKey` with user-secrets/env. Encrypt backend refresh tokens like the API keys already are.
2. **Delete the stale `.ts` composable duplicates** (or finish the migration). Five superseded files are an active correctness trap. Pick one language for the AI seam and make the resolution unambiguous.
3. **Refactor `useVolumeStoryGenerator.js`.** Extract the two write engines, the consistency/auto-fix loop, and the retrieval/context builder into separately-testable units; remove the dead Revisor or wire it in; convert the flagged `writeNextBatch` recursion to a loop. This is the biggest single lever on maintainability and testability.
4. **Finish the `StoryGeneratorPanel.vue` split** (already in progress per STATUS.md) and add the runtime smoke test STATUS.md asks for — the streaming active-generation UI is the riskiest untested surface.
5. **Reconcile the docs.** README/ARCHITECTURE/CONTEXT are materially stale (Dexie version, store count, "no TypeScript," retired modules). Either regenerate them from the code or delete them in favor of STATUS.md, which is accurate.
6. **Add component and integration tests.** Logic is well covered; the 79 components and the end-to-end generation flow are not. A handful of mount tests + one full mocked-LLM generation run would catch the highest-value regressions.
7. **Decide the backend's fate.** Either wire up the SignalR hubs (real-time collab / server streaming are built and unused) and finish CQRS consistently, or trim them to reduce the surface. Harden rate limiting (per-process in-memory won't survive scaling) and add controller/handler tests.
8. **Repo hygiene.** Gitignore/remove the root scratch files (`vite_out.txt`, `backend_stdout.txt`, `*.tmp`, `debug/`, etc.) and drop the legacy `chapters`/`scenes` tables once a migration confirms no readers remain.
```
```

---

*Uncertainties I did not fully verify:* I did not execute the test suite, so the "1092 tests" figure is unconfirmed (I only counted 113 test files). I did not run the generation pipeline end-to-end at runtime. Backend line counts and the "34 DbSets / 36 entities" split are from a directed read, not an exhaustive per-file audit. Everything else is grounded in files read directly during this review.
