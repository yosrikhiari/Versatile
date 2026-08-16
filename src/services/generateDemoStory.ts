/**
 * Dev-only: generate the demo story through the REAL generation pipeline instead
 * of the static `seedDemoStory` shortcut. Exposed on `window.VersatileGenerate`
 * so it can be driven from the browser console against a local Ollama instance:
 *
 *   await VersatileGenerate.demo()   // 10 volumes / 100 chapters, fully generated
 *
 * This uses `useVolumeStoryGenerator` — the same composable the Story Tools
 * panel uses — so every artifact (story bible, the relationship network written
 * via `relationships.ts` with raw entity ids, scene prose, embeddings, canvas
 * node instances, volume groups) is produced by the genuine flow and renders
 * exactly as a user-triggered generation would.
 *
 * A full run streams live into the manuscript and the story network as it goes,
 * so it "shows in a perfect way" — but it is a long, model-bound process (the
 * 100-chapter run can take a very long time on local hardware). Run it from the
 * browser console with the dev server up; the `/ollama` proxy reaches
 * http://localhost:11434.
 *
 * Models are pinned to the locally-available Ollama models on `configureModels()`.
 */

import { db } from './db-core'
import { createProject } from './db-projects'
import { useVolumeStoryGenerator } from '../composables/useVolumeStoryGenerator'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { STORAGE_KEYS } from '../config/storageKeys'

const DEMO_TITLE = 'Demo: The Lighthouse Watch (generated)'
const GENRE = 'Gothic Fantasy Saga'
const TONE = 'dark, lyrical, tense'
const SYNOPSIS =
  'Ten volumes, a hundred chapters, and one failing light. On a storm-battered ' +
  'headland stands the Lighthouse, its lamp the only thing holding the dark at bay. ' +
  'As the light begins to fail, a keeper, his apprentice, a exiled usurper, and the ' +
  'court of a cliff-top keep are drawn into a single unraveling mystery: who is ' +
  'extinguishing the lamp, and what waits in the dark it was meant to keep out.'

/**
 * Pin the running Ollama models so the generated demo uses what is actually
 * installed locally. Idempotent — safe to call repeatedly.
 */
export function configureModels() {
  try {
    localStorage.setItem(STORAGE_KEYS.OLLAMA_MODEL, 'qwen3:8b')
    localStorage.setItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL, 'qwen3:8b')
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}')
    settings.embeddingProvider = 'ollama'
    settings.embeddingModel = 'snowflake-arctic-embed2'
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings))
    console.info('[VersatileGenerate] models → prose/utility: qwen3:8b, embeddings: snowflake-arctic-embed2')
  } catch (e) {
    console.warn('[VersatileGenerate] failed to configure models:', e)
  }
}

async function ensureDemoProject(): Promise<string> {
  const existing = await db.projects.where('name').equals(DEMO_TITLE).first()
  if (existing) return existing.id
  const id = await createProject(DEMO_TITLE, GENRE, SYNOPSIS)
  console.info(`[VersatileGenerate] created project ${id}`)
  return id
}

/**
 * Safety net: make sure every story-bible entity has a canvas node instance so
 * the network can never render with missing nodes. The real pipeline calls
 * `ensureNodeInstances` for the bible and expanded cast, but a generated entity
 * that slipped past those paths would otherwise be invisible on the canvas —
 * this guarantees the whole bible is present.
 */
async function finalizeCanvas(projectId: string) {
  const graphStore = useStoryGraphStore()
  const [characters, locations, plotThreads] = await Promise.all([
    db.characters.where('projectId').equals(projectId).toArray(),
    db.locations.where('projectId').equals(projectId).toArray(),
    db.plotThreads.where('projectId').equals(projectId).toArray()
  ])
  const keys: string[] = []
  for (const c of characters as any[]) keys.push(`char-${c.id}`)
  for (const l of locations as any[]) keys.push(`loc-${l.id}`)
  for (const t of plotThreads as any[]) keys.push(`thread-${t.id}`)
  await graphStore.ensureNodeInstances(projectId, keys)
}

export interface DemoOptions {
  volumes?: number
  chaptersPerVolume?: number
  scenesPerChapter?: number
  wordsPerChapter?: number
  projectId?: string
}

/**
 * Generate the demo story through the real pipeline. Volume 1 bootstraps the
 * story bible + network + 10 chapters; each subsequent volume extends the
 * existing draft by another 10 chapters. Returns the project id when complete.
 */
export async function demo(opts: DemoOptions = {}): Promise<{ projectId: string }> {
  configureModels()

  const volumes = opts.volumes ?? 10
  const chaptersPerVolume = opts.chaptersPerVolume ?? 10
  const scenesPerChapter = opts.scenesPerChapter ?? 3
  const wordsPerChapter = opts.wordsPerChapter ?? 400

  const projectId = opts.projectId ?? (await ensureDemoProject())
  // One generator instance, reused across volumes (mirrors the panel's single
  // `volumeGenerator`), so phase state resets cleanly between volumes.
  const gen = useVolumeStoryGenerator()

  console.info(`[VersatileGenerate] generating volume 1 / ${volumes} (10 chapters)…`)
  await gen.startGeneration({
    projectId,
    synopsis: SYNOPSIS,
    genre: GENRE,
    tone: TONE,
    auto: true,
    structure: { volumes: 1, chaptersPerVolume, scenesPerChapter, wordsPerChapter },
    research: null,
    onChunk: () => {}
  })
  await finalizeCanvas(projectId)

  for (let v = 2; v <= volumes; v++) {
    console.info(`[VersatileGenerate] extending volume ${v} / ${volumes}…`)
    await gen.extendStory({
      projectId,
      volumes: 1,
      chaptersPerVolume,
      scenesPerChapter,
      wordsPerChapter,
      synopsis: SYNOPSIS,
      genre: GENRE,
      tone: TONE,
      onChunk: () => {}
    })
    await finalizeCanvas(projectId)
  }

  const sections = await db.sections.where('projectId').equals(projectId).toArray()
  console.info(
    `[VersatileGenerate] done — ${sections.length} chapters generated for project ${projectId}.`
  )
  return { projectId }
}

export const VersatileGenerate = { configureModels, demo, ensureDemoProject }
