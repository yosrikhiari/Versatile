# Cleanup History

## 2026-06-19: Removed dead `debugSnapshot` code

**What:** Removed the `src/services/debugSnapshot.js` service file and all 100+ call sites across 11 files. Two separate implementations existed:
- Shared service at `src/services/debugSnapshot.js` — posted to `/__debug/snapshot` (no backend route existed, all calls silently failed)
- Local copy in `src/composables/useVolumeStoryGenerator.js` — same dead endpoint

**Files cleaned:**
| File | Calls removed |
|---|---|
| `src/services/debugSnapshot.js` | File deleted (service definition) |
| `src/services/generation/entityGeneration.js` | ~45 calls |
| `src/components/storybible/StoryBiblePanel.vue` | ~18 calls |
| `src/composables/useVolumeStoryGenerator.js` | 10 calls + function definition |
| `src/services/aiService.js` | 4 calls |
| `src/composables/generation/pipeline/index.js` | 5 calls |
| `src/composables/generation/pipeline/modelRunner.js` | 6 calls |
| `src/composables/generation/context/relationshipContext.js` | 4 calls |
| `src/composables/generation/shaping/index.js` | 2 calls |
| `src/composables/generation/context/index.js` | 1 call |
| `src/composables/generation/pipeline/promptBuilder.js` | 1 call |
| `src/stores/storyBibleStore.js` | 4 calls |

**Impact:** Removed ~350 lines of dead code, eliminated wasted POST requests to nonexistent endpoint.
