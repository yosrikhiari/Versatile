## Objective
- Implement Gap 5 (Multi-Turn Session Budget) of the AI pipeline hardening plan

## Important Details
- `SessionBudget` class (check / record / reset / asState) at `src/services/aiProviderBudget.ts:290`
- `AiGenerateOptions.sessionBudget` already accepted at `src/services/aiService.ts:47` — all entry points (`aiGenerate`, `aiStream`, `aiGenerateStructured`) already perform `check()` before call and `record()` after
- `src/composables/useAiService.ts` re‑exports and adds `aiGenerateJson()`; it forwards `AiGenerateOptions` including `sessionBudget` — no changes needed
- Property‑based threading chosen: add `_sessionBudget` closure variable + getter/setter to each composable's return object; methods read it from closure — changes at only 3 composables + Delegator instead of 15+ call sites
- Each composable returns an object of methods; no existing options‑bag pattern — getter/setter is the only consistent pattern that doesn't require new reactive state
- All external call sites (writerTool, directorTool, criticTool) are thin pass‑through wrappers — no direct AI calls, no changes needed

## Work State
### Completed
- **useStoryCritic.ts**: import + `_sessionBudget` var + threaded into 3 aiGenerateJson calls + get/set on return
- **useStoryWriter.ts**: import + `_sessionBudget` var + threaded into extractSceneMetadata options + 2 aiStream/aiGenerate call pairs + extractSceneMetadata call arg + get/set on return
- **useStoryDirector.ts**: import + `_sessionBudget` var + threaded into planChunked options + 2 aiGenerateJson calls + planChunked call arg + aiStream call + aiGenerate retry call + get/set on return
- All 3 composables: `sessionBudget` property on return, closure‑threaded into every AI call

### Active
- Next: wire into Delegator (AgentMemory.ts → Delegator.ts → useDelegatorGeneration.ts)

### Blocked
- (none)
