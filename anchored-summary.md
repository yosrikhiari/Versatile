# Versatile — Anchored Summary

## Goal
Build an AI-powered fiction writing assistant (single-page app) with offline-first architecture, rich manuscript editing, story bible management, AI-assisted generation (via Ollama), TTS narration, and evaluation/quality gates. Vue 3 + Vite + Pinia + Dexie.js IndexedDB.

## Constraints & Preferences
- No backend dependency for core functionality — IndexedDB primary, remote API optional
- Tailwind CSS with `--vers-*` CSS custom properties for dark theming
- Ollama for local AI inference (text generation, brainstorming, evaluation)
- Vite-only build (no meta-framework)
- Contenteditable-based rich text editor (no ProseMirror/TipTap)

## Progress

### Done
- **Manuscript editor**: Rich text, chapter/section management, drag-reorder, snapshot history, tag filtering
- **Story Bible**: Full CRUD for characters, locations, plot threads, entities; auto-generate + AI suggestions
- **Story Network**: VueFlow-based visual entity relationship graph
- **Timeline view**, **Story Canvas** (freeform drag-and-drop), **Scene Outline** with filtering/search
- **Revision system**: Select text → annotate → review via PolishDrawer
- **Spark panel**: Multi-turn AI brainstorming via Ollama
- **Story Generator**: Arc/chapter/scene generation pipeline with streaming preview
- **Research panel**: Web research notes
- **Voice Lab**: TTS narration with customizable voice profiles
- **Archive drawer**: Session history, state snapshots, context preview
- **Notifications**: `useNotifications` composable with toast + confirm modal
- **Auth**: Local IndexedDB login/register + optional remote API via AuthModal
- **Sync engine**: Offline-first background IndexedDB sync
- **Evaluation panel**: Scene quality scoring with revision delta diff view
- **Project management**: Create, archive, reorder projects; volume grouping for chapters
- **Keyboard shortcuts**: Editor navigation (partial — no overlay, no command palette)
- **Evaluation pipeline**: Quality gates, scoring rubrics, revision recommendations
- **DB schema versioning**: Migration support in Dexie schema
- **Cleanup**: Removed dead `debugSnapshot` service (~350 lines, 100+ calls across 11 files, all to nonexistent endpoint) — 2026-06-19
- **UX improvements**: ErrorBoundary component, EmptyState component available

### In Progress (uncommitted working set)
- **Dialogue Detection & Indexing**: HTML content parsed → dialogue extracted via quote matching (7 quote pair types) + em-dash. Speaker identification via dialogue tags + context proximity windows (10-line lookback). Confidence scoring (0.9 tag-match, 0.6 context-match). Stored in IndexedDB `dialogueIndex` table with compound key `[projectId+speakerId]`.
  - Files: `utils/dialogueDetector.js`, `utils/dialogueParser.js`, `utils/speakerIdentifier.js`, `services/db-dialogue.js`, `composables/useDialogueIndexer.js`
- **Scene Context Service**: Builds AI prompt context from completed scenes — prose excerpts (last N words), character states (emotional state, location, scene count, relationships), scene memory (last N scene summaries). Designed for writer prompt injection.
  - File: `services/sceneContextService.js`
- **AI Prompt Builder**: Builds system prompts from voice profiles + craft rules + eval feedback; user prompts from scene briefs, story arcs, chapter logs, embedding context, character sheets, world context. Supports structured JSON output mode with escaped dialogue handling.
  - Files: `composables/usePromptBuilder.js`, `config/documentPrompts.js`
- **Voice Profiles**: 5 literary registers — literary, pulp, minimalist, conversational, atmospheric — each with prose rules, forbidden patterns, sentence rhythm, sensory priorities, dialogue approach, pacing.
  - File: `config/voiceProfiles.js`
- **Voice Lab Panel**: New TTS voice management panel component
  - File: `components/voice-lab/VoiceLabPanel.vue`
- **Focus Trap composable**: Wraps `focus-trap` library as Vue composable with reactive watcher + scope disposal
  - File: `composables/useFocusTrap.js`
- **Async Error composable**: Captures async errors via injected handler for centralized error tracking
  - File: `composables/useAsyncError.js`
- **Modified across 30+ files**: Components (auth, eval, polish, research, spark, storybible, layout, shell), generation pipeline (model runner, prompt builder, shaping, context, entity gen), stores (manuscript, polish, storyBible), services (aiService, db-core, dbService, documentChunker, pdfExtractor), views (Editor, Login, Workspace), config/tests.

### Blocked / Known Issues
- `FocusMode` component registered as keyboard shortcut but file was never created (dead shortcut)
- Two `AuthModal.vue` files exist (`src/components/shared/` and `src/components/layout/`) — likely duplicate
- Sync engine init only wired to remote login/register paths, not local auth — offline users get no sync
- `PolishDrawer.vue` lives at `src/components/layout/` but import path should be verified
- `EmptyState` imported in SceneOutline but may not render on empty datasets

## Key Decisions
1. **Offline-first**: Dexie IndexedDB as primary store; remote API optional. All core functionality works without network.
2. **Contenteditable editor**: Chose over ProseMirror/TipTap for simplicity. Rich text via `document.execCommand` + custom formatting toolbar.
3. **No component library**: Tailwind + custom CSS custom properties for theming. Glassmorphism + dark palette aesthetic.
4. **Dialogue indexing**: Server-side parsing (browser DOMParser), not regex-on-raw-HTML. 7 quote pair types + em-dash support. Confidence-scored speaker identification with human review flag.
5. **Structured AI output**: Prompt builder enforces JSON-only responses with escaped dialogue quotes. Used for scene generation with entity tracking.
6. **Voice profiles as data**: Not templates — each profile includes sensory priorities, forbidden patterns, sentence rhythm, dialogue style. Seeded from config, consumed by prompt builder.

## Next Steps
1. **Complete Dialogue Indexing**: Wire `useDialogueIndexer` into manuscript save flow, add UI for review of low-confidence speaker assignments, integrate speaker stats into story bible
2. **Integrate Prompt Builder**: Connect `usePromptBuilder` + `sceneContextService` into the generation pipeline for context-aware scene writing
3. **UX Gap fixes**: Empty states across 10+ panels, route/page transitions, mobile responsiveness (hamburger, touch targets, safe-area), skeleton loaders, toast type visual differentiation
4. **Auth consolidation**: Unify local/remote auth paths, differentiate in UI, wire sync engine for local auth, add password strength + forgot password
5. **FocusMode**: Implement or remove dead shortcut/component reference
6. **Evaluation v0.5**: Embedding indexing throughput already investigated/perf-fixed; Research/RAG infrastructure next
7. **Keyboard shortcuts**: Add `?` overlay, `Ctrl+N`, `F11`, `Ctrl+K` command palette
8. **Tests**: Expand unit test coverage beyond `useSemanticChunking`

## Critical Context
- **Branch**: `feature/improvements` (diverged from `main` with ~50+ changed files)
- **Last commit**: Auth, sync engine, eval, and DB versioning overhaul (large)
- **Phase**: v0.5 — Research/RAG infrastructure phase after completing Phases 1-4 (AI Pipeline Evaluation & Quality Gates)
- **Recent cleanup**: `debugSnapshot.js` removed — was posting to nonexistent `/__debug/snapshot` endpoint, wasted requests on every generation call
- **Debt**: Contenteditable editor has known focus/selection quirks; no automated E2E tests exist; mobile UX incomplete
- **AI dependency**: Ollama must be running locally for generation/eval features to work
- **No CI/CD**: No test runner configured in CI; manual testing only

## Relevant Files

### Core Architecture
| File | Purpose |
|------|---------|
| `src/router/index.js` | 3 routes (`/login`, `/workspace`, `/editor/:projectId`) + auth guard |
| `src/main.js` | App mount, plugin init, CSS entry |
| `tailwind.config.js` | Custom `--vers-*` theme tokens |
| `vite.config.js` | Build config |

### Stores (Pinia)
| File | Purpose |
|------|---------|
| `src/stores/authStore.js` | Auth state + login/register/logout (local + remote) |
| `src/stores/projectStore.js` | Project CRUD + current project |
| `src/stores/manuscriptStore.js` | Sections, subsections, story elements |
| `src/stores/storyBibleStore.js` | Characters, locations, plot threads, events |
| `src/stores/volumeStore.js` | Volume grouping |
| `src/stores/polishStore.js` | Annotation/polish state |

### AI & Generation Pipeline
| File | Purpose |
|------|---------|
| `src/services/aiService.js` | AI request orchestration |
| `src/services/sceneContextService.js` | Context window builder from completed scenes |
| `src/services/generation/entityGeneration.js` | Entity auto-generation |
| `src/composables/usePromptBuilder.js` | AI prompt construction (system + user) |
| `src/composables/generation/pipeline/promptBuilder.js` | Legacy prompt builder |
| `src/composables/generation/pipeline/modelRunner.js` | Model invocation with streaming |
| `src/composables/generation/context/relationshipContext.js` | Relationship context for prompts |
| `src/composables/useDialogueIndexer.js` | Dialogue indexing orchestrator |
| `src/composables/useStoryWriter.js` | Scene-by-scene writer |
| `src/composables/useVolumeStoryGenerator.js` | Volume-level generation |

### Dialogue System (New)
| File | Purpose |
|------|---------|
| `src/utils/dialogueDetector.js` | Quoted + em-dash dialogue extraction (7 pair types, 100+ speech tags) |
| `src/utils/dialogueParser.js` | HTML → paragraph parsing for dialogue analysis |
| `src/utils/speakerIdentifier.js` | Speaker identification via tag matching + context proximity |
| `src/services/db-dialogue.js` | IndexedDB storage for dialogue entries |
| `src/composables/useDialogueIndexer.js` | Vue composable: index project content → detect → identify → persist |

### Config
| File | Purpose |
|------|---------|
| `src/config/voiceProfiles.js` | 5 voice style profiles (literary, pulp, minimalist, conversational, atmospheric) |
| `src/config/documentPrompts.js` | Prompt templates for different content categories |

### Views & Components
| File | Purpose |
|------|---------|
| `src/views/EditorView.vue` | Main editor layout |
| `src/views/WorkspaceView.vue` | Project list + management |
| `src/views/LoginView.vue` | Local auth screen |
| `src/components/voice-lab/VoiceLabPanel.vue` | TTS voice management panel |
| `src/components/shared/EmptyState.vue` | Reusable empty state |
| `src/components/shared/ErrorBoundary.vue` | Error boundary wrapper |
| `src/components/shared/NotificationHost.vue` | Toast + confirm modal renderer |

### Services
| File | Purpose |
|------|---------|
| `src/services/db-core.js` | Dexie IndexedDB setup + schema versioning |
| `src/services/dbService.js` | High-level database operations |
| `src/services/sync-engine.js` | Offline-first sync |
| `src/services/documentChunker.js` | Document splitting for embedding |
| `src/services/pdfExtractorService.js` | PDF text extraction |
