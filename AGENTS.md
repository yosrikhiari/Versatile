# AGENTS.md

Fiction writing assistant. Vue 3 + Pinia + TipTap frontend, .NET 10 + PostgreSQL 16 backend, 5 AI providers.

## Tech Stack

- **Frontend**: Vue 3 (Composition API), Pinia stores, TipTap editor, Vite, Vitest
- **Backend**: .NET 10, PostgreSQL 16, Entity Framework Core
- **AI**: 5 providers (OpenAI, Anthropic, Google, etc.)
- **Storage**: IndexedDB via Dexie.js (offline-first), PostgreSQL (server)
- **Build/CI**: npm/vite for frontend, dotnet for backend

## Key Conventions

- **Stores** in `src/stores/` — Pinia with setup syntax (`defineStore('name', () => { ... })`)
- **Composables** in `src/composables/` — reusable composition logic
- **Components** in `src/components/` — organized by domain (`storybible/`, `editor/`, etc.)
- **Tests** in `src/tests/unit/` — Vitest with `vi.useFakeTimers()` for debounce tests
- **API calls** go through services in `src/services/`
- **Debounce** any IndexedDB write or expensive computation triggered by rapid user input

## Performance Rules

- Word count → debounce (300ms) via `wordCountTimer`
- IndexedDB writes → debounce (500ms) via per-field timers
- Lookups in render loops (`getEdgeOpacity`, `getStroke`) → use pre-computed `Map` objects, not `Array.find()`
- Independent DB queries → `Promise.all` not serial `await`
- Computed from large reactive arrays → direct property mutation, not spread re-creation
- Only add dependencies that actually change the result to `watch()` / `computed()`

## Testing

- `npm test` — runs Vitest suite
- `npm run lint` — ESLint
- `npm run build` — Vite production build
- New features add tests; debounce tests use `vi.useFakeTimers()`
- Pre-existing test failures (e.g. `dbSchema.test.js`) are unrelated to app code

## Architecture Notes

- Offline-first: Dexie.js writes are batched and debounced; sync happens in background
- Story graph uses Canvas/SVG with cached edge lookups for performance
- Scene evaluations stored in reactive `Map` by scene ID
