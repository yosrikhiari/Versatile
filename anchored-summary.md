# Versatile — Anchored Summary

## Goal
Build an AI-powered fiction writing assistant (single-page app) with offline-first architecture, rich manuscript editing, story bible management, AI-assisted generation (via Ollama), TTS narration, and evaluation/quality gates. Vue 3 + Vite + Pinia + Dexie.js IndexedDB. Backend is ASP.NET Core 8 Clean Architecture with MediatR CQRS, EF Core + PostgreSQL, and Azure OpenAI integration for cloud generation.

## Constraints & Preferences
- No backend dependency for core functionality — IndexedDB primary, remote API optional
- Tailwind CSS with `--vers-*` CSS custom properties for dark theming
- Ollama for local AI inference (text generation, brainstorming, evaluation)
- Vite-only build (no meta-framework)
- TipTap-based rich text editor
- Backend follows Clean Architecture (Jason Taylor template) with vertical slice controllers

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
- **Backend controllers**: Chapter, Scene, Section, Subsection, Volume controllers — all follow same MediatR `Send()` pattern with `IActionResult` returns
- **Backend middleware**: `ExceptionMiddleware` (classic `RequestDelegate`) handling structured `ErrorDetails` responses, `Serilog` request logging, and `CorrelationIdMiddleware`
- **Global error handler**: `Program.cs` uses `AddExceptionHandler<GlobalExceptionHandler>()` (minimal API pattern) — note: this coexists with `ExceptionMiddleware`, creating dual middleware paths for errors
- **Backend auth**: JWT bearer token configured in `Program.cs`, endpoint-level with `[Authorize]` attribute; `AccountController` handles login/register/refresh
- **Backend DI**: Convention-based scanning via `HandlersRegistration`, `ValidatorsRegistration`, `DbContextRegistration` extension methods; plus manual `IOrganizationContext` singleton in `Program.cs`
- **Cross-org data isolation enforcement**: Analyzed 41 backend controller files, identified 34+ data controllers sharing `ApiControllerBase`. Built `RequireOrganizationAttribute` (IAuthorizationFilter — returns 403 when `IOrganizationContext.OrganizationId` is null, respects `[AllowAnonymous]` and `[AllowOrganizationOptional]`) and `AllowOrganizationOptionalAttribute` (marker attribute for opt-out). Applied `[RequireOrganization]` at class level on `ApiControllerBase` (covers all data controllers), `[AllowOrganizationOptional]` on `OrganizationController`. Build passes (0 errors, 0 warnings), all 28 tests pass

### In Progress (uncommitted working set)
- **Delegator Refactoring**: Modular Delegator pattern replacing monolithic `useVolumeStoryGenerator.js` (1599 lines). Centralized shared state (`AgentMemory` with 27 reactive refs + 14 instance slots), event-driven state machine (`Delegator` with routing table + 11 state transitions), narrow agent tool APIs (8 factories), and Vue integration composable (`useDelegatorGeneration`).
  - **Created**: `composables/generation/delegator/` — AgentMemory.js, Delegator.js, useDelegatorGeneration.js, 8 tool factories (director, writer, critic, sync, commit, consistency, scene, graph)
  - **Created**: 5 extracted generation service files (settings, writing, bootstrapper, sync, volumeWrite)
  - **Fixed**: `graphTool.js` — was calling nonexistent `storyGraphService.buildPreliminaryEdges`, now directly imports `buildPreliminaryEdges` from `generation/graph.js` with correct `(projectId, volumeId, plan)` signature
  - **Fixed**: `consistencyTool.js` — `runTerminalConsistencyAudit` now passes `currentTaskId` as 2nd arg matching service signature
  - **Fixed**: `AgentMemory.instances` — added `commitService`, `consistencyService`, `sceneInteractionService` slots (3 new)
  - **Fixed**: `useDelegatorGeneration.initializeToolInstances` — accepts all 14 instance params including 3 new services
  - **Pending**: Integrate Delegator + AgentMemory into `useVolumeStoryGenerator.js` replacing inline phase logic with `dispatch()` calls
  - **Pending**: Construct and wire `SceneInteractionService` (not yet instantiated anywhere)
  - **Pending**: Verify old composable files (`useStorySettings.js`, `useStoryWriter.js`, etc.) for deletion

### Identified Backend Issues

#### Cross-Org Data Isolation
- **Org context not populated during auth**: `IOrganizationContext.OrganizationId` defaults to null — no middleware sets it from the JWT or request context. AuthController correctly has no org context. Previously, all data controllers operating without it silently returned cross-org data. **Mitigated** by `[RequireOrganization]` on `ApiControllerBase`, but the root cause (no middleware to set `OrganizationId`) persists.
- **TenantValidationBehavior query bug**: The MediatR pipeline behavior (`ITenantValidation`/`TenantValidationBehavior`) meant to enforce org context queries `OrganizationMemberships` with the wrong FK — compares to `UserId.OrganizationId` instead of the membership table. Effectively a no-op that never blocks any request.
- **Global query filter null pass-through**: `ApplyTenantFilter` in `OrganizationContext` silently ignores the filter when `OrganizationId` is null, exposing all rows instead of returning an empty set. **Mitigated** by `[RequireOrganization]` at API level, but still a defense-in-depth gap if bypassed.
- **IOrganizationContext is misnamed**: The interface exposes only `OrganizationId?` and `UserId` — it's a session/user context, not a full organization context. Confusing for new developers.

#### Architecture & Pattern
- **RegisterCommand handler doesn't exist**: `RegisterCommand` and `RegisterCommandValidator` exist but no handler class registers with MediatR — the `/api/account/register` endpoint would return a 500 error.
- **Dual error handling**: `ExceptionMiddleware` (custom `RequestDelegate`) and `AddExceptionHandler<GlobalExceptionHandler>()` (minimal API pattern) both active — one or both may be handling the same errors, creating confusion.
- **DI registration split**: Convention scanning registers MediatR handlers, FluentValidation validators, and DbContext automatically; but `IOrganizationContext` is registered manually. If convention scanning also catches `OrganizationContext`, it would register twice — `AddScoped` is idempotent for same type, but a second `IOrganizationContext` binding could shadow the first.
- **Auth inconsistency**: `ChapterController` uses `IMediator.Send()` for everything; `SceneController` calls `IMediator.Send()` for commands but accesses `IOrganizationContext` directly for DB lookups before commands — breaks the pattern where the controller should be a pure MediatR dispatcher.
- **No repository abstraction**: All controllers use `IOrganizationContext` (DbContext) directly — no `IRepository<T>` layer. This means unit testing requires an in-memory database rather than a mock.

#### Documentation & Metadata
- **Missing XML docs/OpenAPI metadata**: Controllers have no `[ProducesResponseType]` attributes or XML comments — Swagger/Scalar output will lack status code documentation.
- **Route design**: Chapters use `api/story/{storyId}/chapter/{id?}`, Scenes use `api/story/{storyId}/scene/{id?}` — consistent for Chapter/Scene but Sections use `api/story/{storyId}/section`, Subsections use `api/story/{storyId}/subsection`, Volumes use `api/story/{storyId}/volume` — the hierarchy is RESTful and follows the entity tree but inconsistent about pluralization style.

### Blocked / Known Issues
- `FocusMode` component registered as keyboard shortcut but file was never created (dead shortcut)
- Two `AuthModal.vue` files exist (`src/components/shared/` and `src/components/layout/`) — likely duplicate
- Sync engine init only wired to remote login/register paths, not local auth — offline users get no sync
- `PolishDrawer.vue` lives at `src/components/layout/` but import path should be verified
- `EmptyState` imported in SceneOutline but may not render on empty datasets
- `RegisterCommand` has no MediatR handler — `POST /api/account/register` returns 500
- `TenantValidationBehavior` has wrong FK in org membership query — never blocks cross-org access at pipeline level (mitigated by `[RequireOrganization]`)
- `OrganizationContext.ApplyTenantFilter` silently passes through null org IDs — exposes all rows instead of empty set when bypassed (mitigated by `[RequireOrganization]`)
- No middleware sets `IOrganizationContext.OrganizationId` from JWT — it always defaults to null; `[RequireOrganization]` blocks access rather than scoping it

## Key Decisions
1. **Offline-first**: Dexie IndexedDB as primary store; remote API optional. All core functionality works without network.
2. **TipTap editor**: ProseMirror-based rich text editor with custom extensions (AutoDialogue, formatting toolbar) and Vue 3 integration.
3. **No component library**: Tailwind + custom CSS custom properties for theming. Glassmorphism + dark palette aesthetic.
4. **Dialogue indexing**: Server-side parsing (browser DOMParser), not regex-on-raw-HTML. 7 quote pair types + em-dash support. Confidence-scored speaker identification with human review flag.
5. **Structured AI output**: Prompt builder enforces JSON-only responses with escaped dialogue quotes. Used for scene generation with entity tracking.
6. **Voice profiles as data**: Not templates — each profile includes sensory priorities, forbidden patterns, sentence rhythm, dialogue style. Seeded from config, consumed by prompt builder.
7. **Backend Clean Architecture**: Jason Taylor template with Application (MediatR), Domain, Infrastructure, Api layers — separates concerns for future multi-tenancy
8. **Convention-based DI**: Reflection scanning for MediatR handlers, validators, DbContext — keeps registrations auto-synced but can shadow manual registrations
9. **DbContext as repository**: `IOrganizationContext` / `OrganizationContext` used directly in controllers and handlers — no repository abstraction; lightweight for current scale but harder to unit-test
10. **Attribute-based org enforcement**: `[RequireOrganization]` as `IAuthorizationFilter` on `ApiControllerBase` — catches all 34+ data controllers without modifying individual handlers. `[AllowOrganizationOptional]` for opt-out (e.g. `OrganizationController`'s self-authorizing methods). API-gate approach chosen over pipeline behavior fix because `TenantValidationBehavior` had deeper bugs and MediatR pipeline behaviors can't return 403 cleanly.

## Next Steps
1. **Complete Delegator integration**: Wire Delegator/AgentMemory/useDelegatorGeneration into `useVolumeStoryGenerator.js` replacing inline phase logic with `dispatch()` calls
2. **Construct SceneInteractionService**: `SceneInteractionService` needs both `commitService` and `consistencyService` — must be instantiated and passed via `initializeToolInstances()`
3. **Verify stale composables**: Audit `useStorySettings.js`, `useStoryWriter.js`, `useVolumeWrite.js`, `useStoryBootstrapper.js`, `useStorySync.js` — either delete or re-export through generation services
4. **Complete Dialogue Indexing**: Wire `useDialogueIndexer` into manuscript save flow, add UI for review of low-confidence speaker assignments, integrate speaker stats into story bible
5. **Integrate Prompt Builder**: Connect `usePromptBuilder` + `sceneContextService` into the generation pipeline for context-aware scene writing
6. **UX Gap fixes**: Empty states across 10+ panels, route/page transitions, mobile responsiveness (hamburger, touch targets, safe-area), skeleton loaders, toast type visual differentiation
7. **Auth consolidation**: Unify local/remote auth paths, differentiate in UI, wire sync engine for local auth, add password strength + forgot password
8. **Backend — fix RegisterCommand handler**: Handler class is missing; endpoint returns 500. Create handler implementing `IRequestHandler<RegisterCommand, AuthResult>`.
9. **Backend — fix TenantValidationBehavior**: Query uses wrong FK for org membership check; make it a no-op-gone-wrong that never actually validates.
10. **Backend — harden global query filter**: `ApplyTenantFilter` should return empty set (`.Where(_ => false)`) when `OrganizationId` is null, not pass through all rows.
11. **Backend — rename IOrganizationContext**: To `ISessionContext` or similar, reflecting it's a user+org session accessor, not a full org context.
12. **Backend — fix dual error middleware**: Decide between `ExceptionMiddleware` and `ExceptionHandler`, remove the other.
13. **Backend — standardize auth patterns**: All controllers: either all MediatR-only or allow direct service calls — by convention, not per-file discretion.
14. **Backend — DI audit**: Verify `IOrganizationContext` registrations don't conflict with convention scanning; add registration policy document.
15. **Backend — add OpenAPI metadata**: `[ProducesResponseType]` attributes and Swagger/Scalar annotations across all controllers.
16. **Backend — evaluate testability**: Repository abstraction vs in-memory EF Core for unit testing.
17. **Evaluation v0.5**: Embedding indexing throughput already investigated/perf-fixed; Research/RAG infrastructure next
18. **Keyboard shortcuts**: Add `?` overlay, `Ctrl+F` search, `Ctrl+K` command palette
19. **Tests**: Expand unit test coverage beyond `useSemanticChunking`

## Critical Context
- **Branch**: `feature/improvements` (diverged from `main` with ~50+ changed files)
- **Last commit**: Cross-org data isolation enforcement — `RequireOrganizationAttribute`, `AllowOrganizationOptionalAttribute`, applied to `ApiControllerBase` + `OrganizationController`
- **Phase**: v0.5 — Research/RAG infrastructure phase after completing Phases 1-4 (AI Pipeline Evaluation & Quality Gates); backend architectural consistency audit initiated; cross-org data isolation gap identified and fixed at API layer
- **Recent cleanup**: `debugSnapshot.js` removed (June); backend cross-org enforcement added (July)
- **Backend status**: ASP.NET Core 8, MediatR 12, EF Core 8 + PostgreSQL, JWT auth, Serilog, GlobalExceptionHandler + ExceptionMiddleware (dual), convention-based DI scanning + manual overrides. 34+ data controllers now protected by `[RequireOrganization]`. However: `OrganizationId` still not set by any middleware, `TenantValidationBehavior` behavior has a wrong-FK bug, global query filter silently passes through null org ids, and `RegisterCommand` handler is missing.
- **Debt**: TipTap integration still evolving; no automated E2E tests exist; mobile UX incomplete; backend has dual error handling, mixed auth patterns, and several unimplemented handlers
- **AI dependency**: Ollama must be running locally for generation/eval features to work
- **CI/CD**: GitHub Actions workflow configured (`.github/workflows/ci.yml`) — lint + test on push/PR

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
| `src/composables/useStoryWriter.js` | Scene-by-scene writer (legacy) |
| `src/composables/useVolumeStoryGenerator.js` | Volume-level generation (1599 lines, targeted for replacement) |
| `src/composables/generation/delegator/AgentMemory.js` | Centralized reactive shared state (27 refs, 14 instance slots) |
| `src/composables/generation/delegator/Delegator.js` | Event-driven state machine (11 transitions, routing table) |
| `src/composables/generation/delegator/useDelegatorGeneration.js` | Vue composable wiring Delegator + tools + instances |
| `src/composables/generation/delegator/tools/directorTool.js` | Tool: plan generation |
| `src/composables/generation/delegator/tools/writerTool.js` | Tool: scene prose writing |
| `src/composables/generation/delegator/tools/criticTool.js` | Tool: scene evaluation + contradiction check |
| `src/composables/generation/delegator/tools/syncTool.js` | Tool: entity sync |
| `src/composables/generation/delegator/tools/commitTool.js` | Tool: checkpoint persist + scene commit |
| `src/composables/generation/delegator/tools/consistencyTool.js` | Tool: incremental + terminal consistency checks |
| `src/composables/generation/delegator/tools/sceneTool.js` | Tool: scene review approval/rejection/regeneration |
| `src/composables/generation/delegator/tools/graphTool.js` | Tool: preliminary entity graph edges |
| `src/composables/generation/commit/CommitService.js` | Service: checkpoint + commit logic |
| `src/composables/generation/consistency/ConsistencyService.js` | Service: consistency rewrite + audit |
| `src/composables/generation/interaction/SceneInteractionService.js` | Service: scene review/lifecycle (not yet constructed) |
| `src/composables/generation/graph.js` | Standalone: buildPreliminaryEdges |

### Dialogue System (New)
| File | Purpose |
|------|---------|
| `src/utils/dialogueDetector.js` | Quoted + em-dash dialogue extraction (7 pair types, 100+ speech tags) |
| `src/utils/dialogueParser.js` | HTML → paragraph parsing for dialogue analysis |
| `src/utils/speakerIdentifier.js` | Speaker identification via tag matching + context proximity |
| `src/services/db-dialogue.js` | IndexedDB storage for dialogue entries |
| `src/composables/useDialogueIndexer.js` | Vue composable: index project content → detect → identify → persist |

### Backend — Controllers
| File | Purpose |
|------|---------|
| `backend/Versatile.Api/Controllers/ApiControllerBase.cs` | Abstract base for all data controllers — exposes `UserId` + `OrganizationId` from JWT; decorated with `[RequireOrganization]` |
| `backend/Versatile.Api/Controllers/RequireOrganizationAttribute.cs` | IAuthorizationFilter — returns 403 when `IOrganizationContext.OrganizationId` is null; respects `[AllowAnonymous]` and `[AllowOrganizationOptional]` |
| `backend/Versatile.Api/Controllers/AllowOrganizationOptionalAttribute.cs` | Marker attribute to opt out of `[RequireOrganization]` enforcement |
| `backend/Versatile.Api/Controllers/AuthController.cs` | Auth (login, register, refresh) — inherits `ControllerBase`, not `ApiControllerBase` (no org context) |
| `backend/Versatile.Api/Controllers/OrganizationController.cs` | Org CRUD + membership management — inherits `ApiControllerBase` with `[AllowOrganizationOptional]` |
| `backend/Versatile.Api/Controllers/ChapterController.cs` | Chapter CRUD via MediatR under `api/story/{storyId}/chapter` |
| `backend/Versatile.Api/Controllers/SceneController.cs` | Scene CRUD — MediatR for commands, direct IOrganizationContext for queries |
| `backend/Versatile.Api/Controllers/SectionController.cs` | Section CRUD via MediatR |
| `backend/Versatile.Api/Controllers/SubsectionController.cs` | Subsection CRUD via MediatR |
| `backend/Versatile.Api/Controllers/VolumeController.cs` | Volume CRUD via MediatR |
| *(~34 additional data controllers follow same `ApiControllerBase` + MediatR pattern)* |

### Backend — Middleware & Config
| File | Purpose |
|------|---------|
| `backend/Versatile.Api/Middleware/ExceptionMiddleware.cs` | Classic RequestDelegate exception handler (may be redundant) |
| `backend/Versatile.Api/Middleware/CorrelationIdMiddleware.cs` | Request correlation ID |
| `backend/Versatile.Api/Middleware/ExceptionHandler.cs` | `IExceptionHandler` implementation (minimal API pattern) |
| `backend/Versatile.Api/Program.cs` | DI registration, middleware pipeline, JWT config, Serilog, CORS |
| `backend/Versatile.Application/` | MediatR commands/queries, FluentValidation, interfaces |
| `backend/Versatile.Domain/` | Entity models |
| `backend/Versatile.Infrastructure/` | DbContext (OrganizationContext), EF config, Identity |

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
