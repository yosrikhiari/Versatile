# Versatile — Fiction Writing Assistant

A browser-based fiction writing environment with AI-powered tools for planning, drafting, revising, and managing narrative projects. Built with Vue 3, Pinia, IndexedDB, and local AI inference, with an optional .NET backend for sync and collaboration.

## Features

### Writing Environment

- **Rich text editor** powered by Tiptap 3 with distraction-free interface
- **Flow Sessions** — timed writing sprints with word count goals, idle detection, and nudge reminders
- **Focus Mode** — minimal UI for uninterrupted writing
- **Auto-save** to local IndexedDB via Dexie; content snapshots dedup and cap per chapter
- **Command palette** (Ctrl+K) sharing one definition with the sidebar
- **Tool panels dock to the right** of a canvas-dominant layout; every panel shares one header/section grammar (`src/components/ui/`)

### AI-Powered Tools

- **Spark** — AI prompts and outlines from user-provided ideas
- **Polish** — paragraph-level prose analysis (repetition, pacing, dialogue, show-don't-tell, etc.)
- **Story Generator** — Ideate / Chapter / Arc / Blurb tabs over one pipeline: bible → network → plan → spine → prose → consistency → chapter gate
- **Director / Writer / Critic** — multi-agent pipeline with streaming output, per-scene quality scoring, and warn-only gates that never discard prose
- **Digest layer** — per-scene digests rolled up into chapter and volume digests, an entity-state timeline, and deterministic contradiction rules that run before any LLM call
- **Cloud escalation (opt-in, per project)** — route whole-manuscript audits or second-opinion critiques to a cloud provider with an explicit disclosure of what is sent
- **Entity Generation** — AI-assisted character, location, and plot thread creation
- **Embedding-Similarity Retrieval** — IVF vector index in a worker for context selection on long stories
- **Context Budgeting** — real token budgets per model, calibrated from observed usage
- **Author Voice Learning** — statistical voice profiling without LLM calls
- **Beta Reader / Consistency / What If / Story Shape / Voice Lab / Character Chat** panels

### Planning & Organization

- **Story Bible** — characters, locations, plot threads, relationships with visual graph network
- **Chapter & Scene Management** — section/subsection hierarchy with drag-and-drop reordering; a project's structure terms adapt to its workspace type (a novel says Chapters/Scenes, a screenplay Scenes/Beats)
- **Story Canvas** — spatial storyboard
- **Timeline View** — chronological plot thread visualization
- **Scene Outline** — structured scene-by-scene breakdown
- **Volume & Branch Management** — organize chapters into volumes; fork alternate branches

### Export & Archive

- Export to **PDF** and **EPUB**
- Session history archive with author model tracking
- Goal tracking (session and daily word counts) across the whole manuscript, not just the root document

## Architecture

```
src/
├── components/         — 134 Vue components across 25 feature dirs
│   └── ui/             — Base* primitives (panel header, section, button, chip, field …)
├── composables/        — ~150 composition modules
│   ├── generation/     — the generation engine, split by concern:
│   │   ├── writing/    — sceneGate, parallelStrategy, batchStrategy, liveDraft, limits
│   │   ├── context/    — scene / entity / manuscript / relationship context, spine
│   │   ├── commit/     — CommitService (persist + digest at commit time)
│   │   ├── consistency/, delegator/, lifecycle/, pipeline/, schemas/, shaping/ …
│   │   ├── runMechanics.ts, evalBootstrap.ts, checkpoint.ts
│   │   └── useChapterStoryGenerator.ts, useGenerationRunController.ts
│   ├── useVolumeStoryGenerator.ts  — orchestrator (phase machine + resume)
│   ├── useStoryDirector.ts         — planning (skeleton + per-chapter scenes)
│   ├── useStoryWriter.ts           — prose + metadata extraction
│   ├── useStoryCritic.ts           — scoring and contradiction audit
│   └── ...
├── services/           — ~120 modules
│   ├── db-schema.ts / db-core.ts   — Dexie schema (v48), 26 db-* table modules
│   ├── aiService.ts    — unified AI provider interface
│   ├── providers/      — OpenAI, Anthropic, Gemini, Groq, Ollama adapters
│   ├── ai/             — token calibration, model/context budgets, prompt store
│   ├── generation/     — digests, rollups, deterministic contradictions, gates, run health
│   ├── vectorIndex*.ts — IVF index + worker
│   └── sync-engine.ts  — offline-to-server sync (14 synced tables)
├── stores/             — 20 Pinia stores (setup syntax)
├── config/             — providers, models, prompts, eval rubrics, gate config, workspaces
└── tests/              — unit (243 files), integration, audit, evaluation, live
```

See `ARCHITECTURE.md` for the system map, `API.md` for the backend contract, `TESTING.md` for every suite, and `docs/GENERATION-PIPELINE-ANALYSIS.md` for how a run behaves.

## Getting Started

### Prerequisites

- **Node.js** 20+ (CI runs 20.x; the frontend image builds on 22)
- **Ollama** (recommended) for local AI inference — or API keys for OpenAI/Anthropic/Gemini/Groq

### Install & Run

```bash
git clone <repo-url>
cd versatile
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

Run `npm install` again after every pull that touches `package.json`. With a stale
`node_modules` the editor route fails to compile (Vite reports a missing export from
`@tiptap/vue-3`) while the login and workspace pages still load, which looks like an app bug.

### Ollama Setup (Local AI)

1. Install [Ollama](https://ollama.com)
2. Pull the defaults: `ollama pull dolphin-mistral:7b` (prose) and `ollama pull qwen3:8b` (utility: planning, metadata, critic); `ollama pull nomic-embed-text` for embeddings
3. The dev server proxies `/ollama` to `http://localhost:11434`

Prose and utility work default to different models on purpose — see `src/config/ollama.ts`. On an 8 GB-class GPU, `qwen3:8b` as the prose model produces measurably better drafts than the uncensored default and passes the quality gate; dolphin stays the default only for content qwen3 refuses (`docs/GENERATION-PIPELINE-ANALYSIS.md` §7).

### Configuration

- **AI Providers**: Configured via the Settings modal in-app — supports Ollama (default), OpenAI, Anthropic, Gemini, Groq
- **Per-feature models**: Each AI feature can use a different provider/model
- **Cloud audit**: per-project opt-in (`cloudAuditOptIn`) plus a global `analysisTier` setting; off by default
- **Portrait generation**: Optional Stable Diffusion integration (proxied to `http://127.0.0.1:7860`)

### Optional backend

The .NET 10 API adds accounts, organisations, sync and collaboration. `docker compose up` starts Postgres, Redis and the API; `--profile frontend` adds the nginx-served SPA and `--profile ollama` a local Ollama. See `docs/DEPLOYMENT.md`.

## Scripts

| Script                     | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `npm run dev`              | Start development server                                        |
| `npm run build`            | Production build (pre-compressed `.br`/`.gz` assets)            |
| `npm run preview`          | Preview production build                                        |
| `npm test`                 | Run unit tests (watch mode)                                     |
| `npm run test:run`         | Run unit tests once (≈2,950 tests)                              |
| `npm run test:coverage`    | Run tests with coverage report                                  |
| `npm run test:e2e`         | Playwright smoke/auth/responsive/panel specs (boots dev server) |
| `npm run typecheck`        | `tsc --noEmit`                                                  |
| `npm run lint`             | ESLint (flat config)                                            |
| `npm run format`           | Prettier formatting                                             |
| `npm run audit:manuscript` | Re-measure duplicate/degraded prose in a generated manuscript   |
| `npm run eval:snapshot`    | Critic regression baseline against a local model                |
| `npm run storybook`        | Component stories with the a11y addon                           |

Long-running, real-model runs live outside the unit suite:

```bash
npx vitest run --config vitest.live.config.js
```

writes a 10-chapter book headless to `reports/live/<slug>/` (`LIVE_MODEL`, `LIVE_CHAPTERS`, `LIVE_SCENES`, `LIVE_WORDS` override the defaults), and

```bash
npx vite-node tools/generate-sample.mjs --model qwen3:8b --words 400
```

writes a 2-scene sample with critic scores and gate verdicts to `reports/`.

## Tech Stack

- **Framework**: Vue 3 (Composition API, `<script setup>`), TypeScript throughout `src/`
- **State**: Pinia (20 stores)
- **Editor**: Tiptap 3 (ProseMirror)
- **Persistence**: Dexie 4, schema v48 (IndexedDB)
- **Styling**: Tailwind CSS 3.4 over `--vers-*` tokens (`docs/DESIGN-TOKENS.md`)
- **Build**: Vite 8
- **Testing**: Vitest 5 + jsdom + fake-indexeddb; Playwright; xUnit for the backend
- **AI**: Ollama, OpenAI, Anthropic, Gemini, Groq; Langfuse tracing optional
- **Backend**: .NET 10, PostgreSQL 16 (row-level security), Redis, SignalR
- **Graph**: Vue Flow (story network)
- **Export**: jsPDF (PDF), html2canvas

## Contributing

Read `AGENTS.md` for the conventions, `TESTING.md` for how to run every suite, `CHANGELOG.md` for what changed and why, and `docs/GENERATION-PIPELINE-ANALYSIS.md` before touching the generator. Both test suites are green on `master`; a failing test is a regression.

## License

[MIT](LICENSE) © 2026 yosrikhiari
