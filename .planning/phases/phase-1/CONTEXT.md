# Phase 1: Writer Pipeline Improvements — Context

## Purpose
Improve Writer agent output quality, context handling, and pipeline integration — better prose generation through structured output mode, eval feedback loops, voice profiles, scene context, reliability, and prompt architecture.

## Status
- Phase being actively discussed and planned. Context records decisions from discuss-phase session.

## Decisions

### D1: Structured Mode — Migrate Orchestrator to writeSceneStructured
- **Decision**: Change `useStoryOrchestrator.js` to call `writeSceneStructured()` instead of `writeScene()`
- **Rationale**: Structured output (`{ prose, usedEntities, newEntities, networkEvents }`) enables entity tracking across scenes, structured eval feedback validation, and consistent data for downstream consumers
- **Impact**: Orchestrator must handle the structured response — store entities per scene, propagate entity state to next scene brief, extract `prose` for display
- **References**: `useStoryWriter.js` exports both modes; `useStoryOrchestrator.js` currently uses only `writeScene`

### D2: Eval Feedback Loop — Refine-on-Fail with Threshold
- **Decision**: When Critic score is below a configurable threshold, re-call Writer with past eval results injected via `pastEvalResults`
- **Mechanism**: `formatEvalFeedback()` already exists in `evalFeedback.js` — pipe formatted feedback back into Writer system prompt with explicit "address these issues" instruction
- **Config**: Threshold (e.g., score < 6), max retries (e.g., 3), per-scene and per-chapter variants
- **Integration points**: `useStoryCritic.js` (score output) → `useStoryWriter.js` (feedback injection) → refine loop controller
- **Volume generator**: Same mechanism applies at chapter level — after Critic evaluates a chapter chapter, if score below threshold, regenerate with feedback

### D3: Voice Profiles Library — Named, Structured Voice Profiles
- **Decision**: Create a voice profiles library with named profiles containing structured attributes
- **Attributes per profile**: sentence length (short/medium/long), vocabulary tier (simple/moderate/rich), dialogue ratio (low/medium/high), imagery density (sparse/moderate/dense), tone (formal/casual/poetic/dry), example prose snippet (1 paragraph)
- **Built-in profiles**: `literary`, `pulp`, `minimalist`, `conversational`, `atmospheric`
- **Fallback chain**: selected profile → `DEFAULT_VOICE` → built-in fallback
- **Storage**: Config file (e.g., `src/config/voiceProfiles.js`)
- **References**: Current implementation is `styleGuide || DEFAULT_VOICE` in `useStoryWriter.js`

### D4: Scene-to-Scene Context — Three-Pronged Enhancement
- **Decision**: Combine three context mechanisms:
  - **a) Prose excerpt window**: Include last 1-2 complete prose paragraphs from most recent scene as contextual examples
  - **b) Character state tracking**: Per-scene snapshot of each active character's location, emotional state, active goals, relationships — propagated and summarized across scenes
  - **c) Scene memory bank**: Key events, revealed information, unresolved threads stored per scene; summarized version injected into Writer brief
- **Integration**: New composable or service (`useSceneContext` or `sceneMemoryService.js`) that collects, compresses, and formats all three sources into the Writer's context block

### D5: Reliability — Full Suite
- **Decision**: Add all four reliability mechanisms:
  - **a) Retry with exponential backoff**: Max 3 attempts, 1s/2s/4s delays, configurable
  - **b) Prose quality validation**: Check minimum length, complete sentences, no truncation markers; retry on failure
  - **c) Token budget management**: Track per-call token usage; dynamically compress context sections when approaching model limit
  - **d) Streaming timeout**: Configurable timeout per stream; on timeout, return accumulated partial prose with warning instead of failing
- **Implementation**: Wrap `writeScene`/`writeSceneStructured` calls with a reliability layer (composable or HOF)

### D6: Prompt Architecture — Sections + Builder Composable
- **Decision**: Separate Writer prompt into clearly delimited sections AND create a prompt builder composable
- **Sections**: Prose Goals | Format Rules | Context | Past Feedback | Voice Profile
- **Builder**: `usePromptBuilder` composable that assembles sections dynamically based on available data (scene type, voice profile presence, eval feedback availability)
- **Template variables**: Section visibility controlled by input context — e.g., Past Feedback section only included when eval results exist

### D7: Volume Generator — Refine-on-Fail at Chapter Level + Gate-Failure Routing
- **Decision**: Two improvements to `useVolumeStoryGenerator.js`:
  - **a) Chapter-level refine-on-fail**: After Critic evaluates a completed chapter, if score below threshold, regenerate with specific feedback injected (same D2 pattern, applied at chapter granularity)
  - **b) Gate-failure routing**: When a specific quality gate fails (not just low score), route the gate's failure reasons back to Writer rather than a blind retry — e.g., "continuity gate failed: character Alice's location changed without explanation"
- **Differentiation from D2**: D2 is scene-level refinement within a single orchestration loop; D7 is chapter-level refinement in the volume generation pipeline with explicit gate-aware routing

## Unresolved Items
- **Refine threshold values**: Exact score threshold for refine-on-fail (D2, D7) — needs empirical tuning
- **Retry counts**: Max retries for refine loops — needs empirical tuning
- **Voice profile attribute ranges**: Precise definition of each attribute's range per profile — needs design
- **Token budget limits**: Per-model token limits and section compression ratios — needs model-specific config

## Resolved Items
- (none yet — phase being planned)

## File References
| File | Role |
|------|------|
| `src/composables/useStoryWriter.js` | Core Writer composable — target for structured mode, reliability, prompt architecture |
| `src/composables/useStoryOrchestrator.js` | Orchestrator — target for structured mode migration, eval feedback loop |
| `src/composables/useVolumeStoryGenerator.js` | Volume generator — target for chapter-level refine + gate-failure routing |
| `src/services/evalFeedback.js` | `formatEvalFeedback()` — already exists, consumed by refine loops |
| `src/services/evalGates.js` | Quality gates — consumed by gate-failure routing |
| `src/config/documentPrompts.js` | Prompt templates — target for section separation |
| `src/config/workspace.js` | Workspace type enum |
| `.planning/codebase/ARCHITECTURE.md` | System architecture reference |
| `.planning/codebase/STACK.md` | Tech stack reference |

## Downstream Contracts
- **Phase 2 (Revisor)**: Consumes improved scene context and structured entity data for revision work
- **No downstream phases depend on Phase 1**: v1.1 phases are independent Writer/Evaluator/Revisor improvements
