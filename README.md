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
- **Story Generator** — multi-step pipeline: Director (scene planning), Writer (structured scene prose), Critic (consistency checks), Revisor (targeted fixes)
- **Entity Generation** — AI-assisted character, location, and plot thread creation
- **Semantic Chunking** — context-aware text segmentation for efficient AI context windows
- **Context Compaction** — smart summarization to stay within token budgets

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
├── components/         — Vue components organized by feature area
│   ├── flow/           — Editor and flow session UI
│   ├── layout/         — App shell, modals, panels
│   ├── manuscript/     — Canvas, outline, chapters, timeline
│   ├── polish/         — Prose analysis drawer
│   ├── revise/         — Revision panel
│   ├── story/          — Story generator panel
│   ├── storybible/     — Character/location/plot management + graph
│   └── volume/         — Volume management
├── composables/        — Reusable stateful logic
│   ├── generation/     — Context building, shaping (relevance, token budget), generators, pipeline, schemas
│   ├── useStoryDirector.js   — Scene planning with evidence-driven story contracts
│   ├── useStoryWriter.js     — Scene prose generation with structured output
│   ├── useStoryCritic.js     — Draft consistency analysis
│   ├── useStoryRevisor.js    — Targeted revision from critique results
│   ├── useStoryDocuments.js  — Synopsis, character, world, timeline document generation
│   └── useFlowSession.js     — Shared flow/timer session singleton
├── services/           — Data persistence and external API wrappers
│   ├── db-core.js      — Dexie IndexedDB schema (16 versions)
│   ├── aiService.js    — Unified AI provider interface
│   ├── providers/      — OpenAI, Anthropic, Gemini, Groq, Ollama adapters
│   └── generation/     — Entity detection, polish analysis, spark generation
├── stores/             — Pinia state management
│   ├── flowStore.js    — Timer, idle detection, backspace tracking
│   ├── projectStore.js — Project metadata, word counts, goals
│   ├── polishStore.js  — Annotation CRUD with debounced analysis
│   └── settingsStore.js — AI provider/model configuration
└── config/             — AI providers, document prompts, storage keys, blueprints
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

AI features are automatically disabled when Ollama is unreachable.

### Configuration

- **AI Providers**: Configured via the Settings modal in-app — supports Ollama (default), OpenAI, Anthropic, Gemini, Groq
- **Per-feature models**: Each AI feature (Spark, Polish, Story Generation, etc.) can use a different provider/model
- **Portrait generation**: Optional Stable Diffusion integration (proxied to `http://127.0.0.1:7860`)

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm test` | Run unit tests (watch mode) |
| `npm run test:run` | Run unit tests once |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier formatting |

## Tech Stack

- **Framework**: Vue 3 (Composition API, `<script setup>`)
- **State**: Pinia
- **Editor**: Tiptap (ProseMirror)
- **Persistence**: Dexie (IndexedDB)
- **Styling**: Tailwind CSS
- **Build**: Vite
- **Testing**: Vitest + jsdom
- **AI**: Ollama, OpenAI, Anthropic, Gemini, Groq
- **Graph**: Vue Flow (node graph for story network)
- **Export**: jsPDF (PDF), html2canvas
