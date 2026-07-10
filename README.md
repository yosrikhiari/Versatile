# Versatile — Fiction Writing Assistant

A browser-based fiction writing environment with AI-powered tools for planning, drafting, revising, and managing narrative projects. Built with Vue 3, Pinia, IndexedDB, and local AI inference.

## Features

### Writing Environment
- **Rich text editor** powered by Tiptap with distraction-free interface
- **Flow Sessions** — timed writing sprints with word count goals, idle detection, and nudge reminders
- **Focus Mode** — minimal UI for uninterrupted writing
- **Auto-save** to local IndexedDB via Dexie

### AI-Powered Tools
- **Spark** — AI prompts and outlines from user-provided ideas
- **Polish** — paragraph-level prose analysis (repetition, pacing, dialogue, show-don't-tell, etc.)
- **Novel Pipeline** — autonomous DAG: bible → network → structure → spine → prose → consistency
- **Director / Writer / Critic** — multi-agent pipeline with streaming output and per-scene quality scoring
- **Entity Generation** — AI-assisted character, location, and plot thread creation
- **Embedding-Similarity Retrieval** — context-aware text selection for long stories (25+ scenes)
- **Context Compaction** — smart summarization to stay within token budgets
- **Author Voice Learning** — statistical voice profiling without LLM calls

### Planning & Organization
- **Story Bible** — characters, locations, plot threads, relationships with visual graph network
- **Chapter & Scene Management** — section/subsection hierarchy with drag-and-drop reordering
- **Story Canvas** — spatial storyboard
- **Timeline View** — chronological plot thread visualization
- **Scene Outline** — structured scene-by-scene breakdown
- **Volume Management** — organize chapters into volumes

### Export & Archive
- Export to **PDF** and **EPUB**
- Session history archive with author model tracking
- Goal tracking (session and daily word counts)

## Architecture

```
src/
├── components/         — Vue components (79 across 20 feature dirs)
├── composables/        — Reusable stateful logic (~55 composables)
│   ├── generation/     — Context, shaping, pipeline, schemas, generators
│   ├── useNovelPipeline.js     — Declarative DAG facade
│   ├── useVolumeStoryGenerator.js  — Generation engine
│   ├── useStoryDirector.js     — Scene planning
│   ├── useStoryWriter.js       — Scene prose generation
│   ├── useStoryCritic.js       — Draft consistency analysis
│   └── ...
├── services/           — Persistence and external API wrappers (~55 modules)
│   ├── db-core.js      — Dexie IndexedDB schema (v31, ~34 tables)
│   ├── aiService.ts    — Unified AI provider interface
│   ├── providers/      — OpenAI, Anthropic, Gemini, Groq, Ollama adapters
│   ├── sync-engine.js  — Offline-to-server sync
│   └── generation/     — Entity detection, polish analysis, spark generation
├── stores/             — 15 Pinia stores (auth, archive, bubble, characterChat, flow,
│                       — manuscript, polish, project, settings, snapshot, spark,
│                       — storyBible, storyGraph, volume, volumeStoryNetwork)
├── config/             — AI providers, document prompts, eval rubrics, blueprints
└── tests/              — 113 test files (1159 tests)
```

## Getting Started

### Prerequisites

- **Node.js** 18+
- **Ollama** (recommended) for local AI inference — or API keys for OpenAI/Anthropic/Gemini/Groq

### Install & Run

```bash
git clone <repo-url>
cd versatile
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

### Ollama Setup (Local AI)

1. Install [Ollama](https://ollama.com)
2. Pull a model: `ollama pull llama3.2` (or any compatible model)
3. The dev server proxies `/ollama` to `http://localhost:11434`

### Configuration

- **AI Providers**: Configured via the Settings modal in-app — supports Ollama (default), OpenAI, Anthropic, Gemini, Groq
- **Per-feature models**: Each AI feature can use a different provider/model
- **Portrait generation**: Optional Stable Diffusion integration (proxied to `http://127.0.0.1:7860`)

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm test` | Run unit tests (watch mode) |
| `npm run test:run` | Run unit tests once (1159 tests) |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier formatting |

## Tech Stack

- **Framework**: Vue 3 (Composition API, `<script setup>`)
- **State**: Pinia (15 stores)
- **Editor**: Tiptap (ProseMirror)
- **Persistence**: Dexie v31 (IndexedDB, ~34 tables)
- **Styling**: Tailwind CSS
- **Build**: Vite
- **Testing**: Vitest + jsdom (113 files, 1159 tests)
- **AI**: Ollama, OpenAI, Anthropic, Gemini, Groq
- **Backend**: .NET 10 (optional, for cloud sync)
- **Graph**: Vue Flow (node graph for story network)
- **Export**: jsPDF (PDF), html2canvas
