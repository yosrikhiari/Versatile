# Versatile

## Core Value
AI-powered fiction writing assistant that orchestrates a multi-agent generation pipeline — Director, Writer, Critic, and Revisor agents — to help writers produce, evaluate, and iteratively improve fiction.

## Stated Constraints
- Brownfield: existing Vue 3 SPA running entirely client-side (Dexie.js/IndexedDB)
- Frontend-only (backend .NET disconnected)
- 5 AI providers: OpenAI, Anthropic, Google, OpenRouter, Ollama
- 4-phase pipeline: Director (outline) → Writer (draft) → Critic (feedback) → Revisor (rewrite)
- Author Voice Learning (Phase 2) still being integrated
- 72 existing tests, none covering AI evaluation quality
- 16 workspace types (first-draft, outline, outline-generation, etc.)

## Explicit Scope Boundaries
- This milestone focuses on the **AI evaluation pipeline** only: Critic and Revisor quality, eval rubrics, automated quality gates
- Not re-architecting the app, not adding new features
- Not writing backend code or migrating off IndexedDB
- UI changes limited to what's needed to surface evaluation results

## Domain
AI-powered creative writing assistant
