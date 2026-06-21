# Versatile

## Core Value
AI-powered fiction writing assistant that orchestrates a multi-agent generation pipeline — Director, Writer, Critic, and Revisor agents — to help writers produce, evaluate, and iteratively improve fiction.

## Current State
- **v1.0 shipped** — AI Pipeline Evaluation & Quality Gates
- **v0.5 planned** — Research/RAG System & Infrastructure Hardening (3 parallel phases)
- **v1.1 planned** — Writer & Eval Quality Improvements (6 phases)
- Critic/Revisor evaluation pipeline fully defined, audited, gated, and surfaced in UI
- 163 eval tests across 6 test files, all passing
- 6 workspace type dimension sets with 30 complete 1-10 rubrics
- Automated quality gates: dimension coverage, score distribution, revision effectiveness
- EvalPanel and RevisionDeltaPanel integrated into StoryGeneratorPanel.vue
- Degradation tracking with per-dimension delta badges

## Stated Constraints
- Brownfield: existing Vue 3 SPA running entirely client-side (Dexie.js/IndexedDB)
- Frontend-only (backend .NET disconnected)
- 5 AI providers: OpenAI, Anthropic, Google, OpenRouter, Ollama
- 4-phase pipeline: Director (outline) → Writer (draft) → Critic (feedback) → Revisor (rewrite)
- Author Voice Learning (Phase 2) still being integrated
- 16 workspace types (first-draft, outline, outline-generation, etc.)

## Domain
AI-powered creative writing assistant
