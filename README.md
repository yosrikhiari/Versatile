# Versatile — Fiction Writing Assistant

Versatile is a feature-rich, AI-powered fiction writing environment built as a single-page application. It combines a distraction-free rich text editor with brainstorming, revision, world-building, and story generation tools — all running client-side.

---

## Features

- **FlowEditor** — Rich text prose editor with a dark, ambient theme and Pomodoro-style flow timer.
- **Spark** — AI-powered brainstorming assistant with prompt templates, outline generation, and structured results.
- **Polish** — Paragraph-level prose analysis and improvement suggestions.
- **Revise** — Takes critic feedback and rewrites prose accordingly.
- **Story Bible** — Manage characters, locations, and plot threads with AI-assisted generation and enhancement.
- **Story Network** — Visual relationship graph between entities.
- **Story Generator** — Full pipeline: entity bootstrapping → scene planning (Director) → prose writing (Writer) → consistency checking (Critic).
- **Planning Tools** — Story canvas, scene outline, chapter manager with drag-and-drop, timeline view.
- **Multi-Workspace** — 16 workspace types (Novel, Screenplay, Legal, Technical, etc.) with tailored terminology.
- **Search** — Full-text search across the manuscript.
- **Snapshots** — Named version history for your projects.
- **Export** — PDF, EPUB, and project archive export/import.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The dev server runs at `http://localhost:5173`.

---

## AI Setup

Versatile uses AI for its writing assistance features. By default, it connects to a local **Ollama** instance.

### Option 1: Local (Ollama)

1. Install [Ollama](https://ollama.com/)
2. Pull a model (e.g., `ollama pull llama3`)
3. Versatile connects at `http://localhost:11434` by default

### Option 2: Cloud Providers

Configure API keys in the Settings panel:

- **OpenAI** — GPT-4o, GPT-4, GPT-3.5
- **Anthropic** — Claude Opus, Sonnet, Haiku
- **Google Gemini** — Gemini 2.5 Pro/Flash, 1.5 Pro
- **Groq** — Various open models

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm test` | Run tests (Vitest watch mode) |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier formatting |

---

## Keyboard Shortcuts

| Key | Panel |
|---|---|
| `1` | Spark (Brainstorming) |
| `2` | Polish (Prose analysis) |
| `3` | Story Bible (Entities) |
| `4` | Revise (Revision) |
| `5` | Canvas (Story board) |
| `6` | Outline (Scene outline) |
| `7` | Chapters (Chapter manager) |
| `8` | Network (Entity graph) |
| `g` | Story Generator |
| `f` | Flow Timer |
| `?` | Shortcuts reference |

---

## Tech Stack

- **Framework:** Vue 3 (Composition API, `<script setup>`)
- **Build:** Vite 5
- **State:** Pinia
- **Styling:** Tailwind CSS 3
- **Editor:** TipTap (ProseMirror)
- **Database:** IndexedDB via Dexie.js
- **Testing:** Vitest + Vue Test Utils + Playwright
- **Icons:** Lucide
- **Charts/Graphs:** Vue Flow

---

## Project Structure

```
src/
├── App.vue                          # Root component — orchestrates panels, keyboard shortcuts, app init
├── main.js                          # Entry point — mounts Vue app with Pinia
├── style.css                        # Global styles — Tailwind layers, glass surfaces, ambient glow, grain texture
│
├── components/                      # Vue components organized by feature
│   ├── flow/
│   │   ├── FlowEditor.vue           # Rich text prose editor (TipTap/ProseMirror)
│   │   ├── FlowNudge.vue            # Gentle writing nudges / notifications
│   │   └── FlowTimer.vue            # Pomodoro-style writing timer with word tracking
│   │
│   ├── layout/
│   │   ├── AppShell.vue             # Main application shell / panel layout
│   │   ├── ArchiveDrawer.vue        # Archived project management drawer
│   │   ├── ContextStatusIndicator.vue # AI context status display
│   │   ├── ModeButton.vue           # Mode toggle button
│   │   ├── ProjectSettingsModal.vue # Per-project settings
│   │   ├── RecapBanner.vue          # Session recap banner
│   │   ├── SettingsModal.vue        # Global application settings
│   │   └── WelcomeOnboarding.vue    # First-run onboarding flow
│   │
│   ├── manuscript/
│   │   ├── ChapterManager.vue       # Chapter/scene tree with drag-and-drop, volume assignment
│   │   ├── SceneOutline.vue         # Hierarchical scene outline view
│   │   ├── SearchOverlay.vue        # Full-text search across the manuscript
│   │   ├── SnapshotHistoryDrawer.vue # Named version history browser
│   │   ├── StoryCanvas.vue          # Visual scene/beat board
│   │   └── TimelineView.vue         # Chronological scene timeline
│   │
│   ├── polish/
│   │   ├── PolishAnnotation.vue     # Individual prose annotation/analysis display
│   │   ├── PolishDrawer.vue         # Prose analysis and improvement suggestions panel
│   │   └── SnippetsDrawer.vue       # Saved prose snippets browser
│   │
│   ├── revise/
│   │   └── RevisePanel.vue          # Revision tool — applies critic feedback to rewrite prose
│   │
│   ├── shared/
│   │   ├── AmbientShader.vue        # WebGL ambient background shader
│   │   ├── AppTooltip.vue           # Reusable tooltip component
│   │   ├── BaseIcon.vue             # Icon wrapper component (Lucide)
│   │   ├── ChapterContextSelector.vue # Chapter/scene context picker
│   │   ├── DatabaseRecovery.vue     # IndexedDB recovery/repair UI
│   │   ├── GoalProgressBar.vue      # Daily writing goal progress bar
│   │   ├── Modal.vue                # Generic modal dialog
│   │   ├── NotificationHost.vue     # Toast notification container
│   │   └── TagInput.vue             # Tag/chip input component
│   │
│   ├── spark/
│   │   ├── BlueprintResult.vue      # Structured brainstorm result display
│   │   ├── IdeaInput.vue            # Freeform idea input
│   │   ├── SparkPanel.vue           # Brainstorming assistant panel
│   │   └── SparkPromptCard.vue      # Prompt template card
│   │
│   ├── story/
│   │   ├── GenerationLoadingScreen.vue # Full-screen generation progress overlay
│   │   ├── GenerationSyncPreview.vue   # Review AI-discovered new entities
│   │   └── StoryGeneratorPanel.vue     # Large-scale story generation pipeline UI
│   │
│   ├── storybible/
│   │   ├── AddConnectionModal.vue      # Add entity relationship modal
│   │   ├── ApplySuggestionsModal.vue   # Review/apply AI suggestions modal
│   │   ├── AutoGenerateModal.vue       # Bulk entity generation modal
│   │   ├── CharacterPortrait.vue       # AI-generated character portrait display
│   │   ├── EntityCard.vue              # Entity summary card
│   │   ├── EntityExtractionDialog.vue  # Extract entities from text dialog
│   │   ├── EntitySidebar.vue           # Entity detail sidebar
│   │   ├── GenerateCharacterModal.vue  # Single character generation modal
│   │   ├── PlotThreadBoard.vue         # Plot thread kanban board
│   │   ├── StoryBiblePanel.vue         # Main Story Bible panel (characters/locations/plots)
│   │   ├── StoryNetwork.vue            # Visual entity relationship graph (Vue Flow)
│   │   └── SuggestionsModal.vue        # AI suggestions review modal
│   │
│   └── volume/
│       └── VolumeAssignmentPanel.vue   # Volume/chapter/scene hierarchy management
│
├── composables/                     # Composition API logic (35 files)
│   ├── ai/                          # (empty — AI helpers live at root level)
│   ├── generation/
│   │   ├── context/
│   │   │   ├── entityContext.js     # Entity context assembly for prompts
│   │   │   ├── index.js             # Context barrel export
│   │   │   ├── manuscriptContext.js # Manuscript excerpt context
│   │   │   ├── projectContext.js    # Project metadata context
│   │   │   └── relationshipContext.js # Entity relationship context
│   │   ├── generators/
│   │   │   ├── character.js         # Character entity generation
│   │   │   ├── index.js             # Generators barrel export
│   │   │   ├── location.js          # Location entity generation
│   │   │   └── plotThread.js        # Plot thread entity generation
│   │   ├── pipeline/
│   │   │   ├── index.js             # Pipeline barrel export
│   │   │   ├── modelRunner.js       # AI model invocation runner
│   │   │   └── promptBuilder.js     # Dynamic prompt construction
│   │   ├── schemas/
│   │   │   ├── character.js         # Character entity schema
│   │   │   ├── index.js             # Schemas barrel export
│   │   │   ├── location.js          # Location entity schema
│   │   │   └── plotThread.js        # Plot thread entity schema
│   │   ├── shaping/
│   │   │   ├── index.js             # Shaping barrel export
│   │   │   ├── relevance.js         # Relevance scoring for context selection
│   │   │   └── tokenBudget.js       # Token budget calculation/management
│   │   ├── index.js                 # Generation composables barrel export
│   │   └── utils.js                 # Generation utility functions
│   │
│   ├── testwrite.js                 # Test writing utility
│   ├── useAppInitialization.js      # App startup logic
│   ├── useAuthorModel.js            # Author voice/style model
│   ├── useChapterGenerationSync.js  # New entity sync during generation
│   ├── useChapterSceneManager.js    # Chapter/scene CRUD operations
│   ├── useClickOutside.js           # Click-outside detection
│   ├── useContextCompactor.js       # Context compression for token efficiency
│   ├── useContextRetrieval.js       # Context retrieval from story bible
│   ├── useDraggableList.js          # Drag-and-drop list logic
│   ├── useEntityBootstrapper.js     # AI entity generation from synopsis
│   ├── useEntityExtractor.js        # Extract entities from narrative text
│   ├── useExportImport.js           # Project export/import logic
│   ├── useFlowSession.js            # Flow writing session state
│   ├── useFlowTimer.legacy.js       # Legacy flow timer (replaced by FlowTimer.vue)
│   ├── useGraphContext.js           # Entity graph context for AI
│   ├── useKeyboardShortcuts.js      # Global keyboard shortcut handler
│   ├── useLocalStorage.js           # LocalStorage reactive wrapper
│   ├── useManuscriptContext.js      # Manuscript context for AI prompts
│   ├── useNetworkSuggestions.js     # Entity network AI suggestions
│   ├── useNotifications.js          # Toast notification system
│   ├── useOllama.js                 # Ollama connection/status composable
│   ├── useSemanticChunking.js       # Semantic text chunking for AI context
│   ├── useSnippets.js               # Prose snippet management
│   ├── useStateSummarizer.js        # State summarization for AI context
│   ├── useStoryCritic.js            # Story consistency checking (Critic phase)
│   ├── useStoryDirector.js          # AI scene planning (Director phase)
│   ├── useStoryDocuments.js         # Story document management
│   ├── useStoryExport.js            # Story export (PDF/EPUB)
│   ├── useStoryOrchestrator.js      # Full pipeline orchestration
│   ├── useStoryResearcher.js        # AI research/information gathering
│   ├── useStoryRevisor.js           # Prose revision logic
│   ├── useStoryWriter.js            # AI prose writing (Writer phase)
│   ├── useTooltipManager.js         # Tooltip visibility management
│   └── useVolumeStoryGenerator.js   # Volume-level generation orchestrator
│
├── config/                         # Configuration files
│   ├── ai.js                       # AI provider definitions, model lists, feature mappings
│   ├── archive.js                  # Archive settings
│   ├── blueprints.js               # Story blueprint templates
│   ├── documentPrompts.js          # Per-workspace AI prompts (Director/Writer/Critic/Revisor)
│   ├── ollama.js                   # Ollama endpoint/model configuration
│   ├── statuses.js                 # Status constants
│   ├── storageKeys.js              # Centralized localStorage key registry
│   └── workspace.js                # 16 workspace types with labels, icons, terminology
│
├── constants/                      # Application constants
│   └── generationModes.js          # Story generation mode definitions
│
├── services/                       # Service layer
│   ├── ai/
│   │   └── aiHelpers.js           # AI response parsing and helper utilities
│   ├── generation/
│   │   ├── entityDetection.js      # Detect entities in generated text
│   │   ├── entityGeneration.js     # Entity generation service
│   │   ├── polishAnalysis.js       # Prose analysis service
│   │   └── sparkGeneration.js      # Brainstorming generation service
│   ├── providers/
│   │   ├── anthropic.js            # Anthropic Claude API provider
│   │   ├── gemini.js               # Google Gemini API provider
│   │   ├── groq.js                 # Groq API provider
│   │   ├── ollama.js               # Ollama local API provider
│   │   └── openai.js               # OpenAI API provider
│   ├── aiService.js                # AI provider routing and request dispatch
│   ├── db-archive.js               # Archived projects IndexedDB access
│   ├── db-core.js                  # Dexie database schema, instance, migrations (13 versions)
│   ├── db-entities.js              # Characters, locations, plot threads DB access
│   ├── db-export.js                # Export data DB access
│   ├── db-goals.js                 # Daily writing goals DB access
│   ├── db-graph.js                 # Entity relationship graph DB access
│   ├── db-projects.js              # Project metadata DB access
│   ├── db-snapshots.js             # Snapshots/version history DB access
│   ├── db-story-documents.js       # Story document DB access
│   ├── db-structure.js             # Volume/chapter/scene structure DB access
│   ├── db-volume-entities.js       # Volume-level entity DB access
│   ├── db-writing.js               # Manuscript content DB access
│   ├── dbRecovery.js               # IndexedDB recovery utilities
│   ├── dbService.js                # Centralized database service
│   ├── embeddingService.js         # Text embedding operations
│   ├── exportService.js            # PDF and EPUB export service
│   ├── jsonExtractor.js            # JSON extraction from AI responses
│   ├── ollamaService.js            # Ollama-specific operations (embeddings, encryption)
│   └── portraitService.js          # AI character portrait generation
│
├── stores/                         # Pinia state stores
│   ├── archiveStore.js             # Archived project state
│   ├── flowStore.js                # Flow timer session state
│   ├── manuscriptStore.js          # Manuscript content and word counts
│   ├── polishStore.js              # Polish annotation state
│   ├── projectStore.js             # Project metadata, workspace type
│   ├── settingsStore.js            # User settings and preferences
│   ├── snapshotStore.js            # Snapshot version history state
│   ├── sparkStore.js               # Spark brainstorm session state
│   ├── storyBibleStore.js          # Characters, locations, plot threads state
│   ├── storyGraphStore.js          # Entity relationship graph state
│   ├── volumeStore.js              # Volumes/chapters/scenes tree state
│   └── volumeStoryNetworkStore.js  # Volume-level network state
│
├── tests/
│   ├── integration/
│   │   └── example.test.js         # Integration test example
│   ├── mocks/
│   │   └── dbMock.js               # IndexedDB mock for testing
│   ├── unit/
│   │   ├── aiHelpers.test.js
│   │   ├── dbCore.test.js
│   │   ├── dbGraph.test.js
│   │   ├── entityGeneration.test.js
│   │   ├── example.test.js
│   │   ├── flowStore.test.js
│   │   ├── generationUtils.test.js
│   │   ├── jsonExtractor.test.js
│   │   ├── manuscriptStore.test.js
│   │   ├── ollamaService.test.js
│   │   ├── polishStore.test.js
│   │   ├── projectStore.test.js
│   │   ├── relevance.test.js
│   │   ├── settingsStore.test.js
│   │   ├── shaping.test.js
│   │   ├── sparkGeneration.test.js
│   │   ├── sparkStore.test.js
│   │   ├── tokenBudget.test.js
│   │   ├── useGraphContext.test.js
│   │   ├── useSemanticChunking.test.js
│   │   ├── useStoryCritic.test.js
│   │   ├── useStoryDirector.test.js
│   │   ├── useStoryDocuments.test.js
│   │   ├── useStoryExport.test.js
│   │   ├── useStoryOrchestrator.test.js
│   │   ├── useStoryResearcher.test.js
│   │   ├── useStoryRevisor.test.js
│   │   ├── useStoryWriter.test.js
│   │   ├── useVolumeStoryGenerator.test.js
│   │   └── volumeStore.test.js
│   └── setup.js                    # Test environment setup
│
└── utils/
    └── textUtils.js                # Text manipulation utilities
```

---

## License

MIT
