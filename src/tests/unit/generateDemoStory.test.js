import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '../../services/db-core'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { configureModels, VersatileGenerate } from '../../services/generateDemoStory'

const DEMO_TITLE = 'Demo: The Lighthouse Watch (generated)'

describe('generateDemoStory (real-pipeline demo generator)', () => {
  beforeAll(async () => {
    await db.open()
  })

  it('configureModels pins the local Ollama models + embeddings', () => {
    configureModels()

    expect(localStorage.getItem(STORAGE_KEYS.OLLAMA_MODEL)).toBe('qwen3:8b')
    expect(localStorage.getItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL)).toBe('qwen3:8b')

    const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}')
    expect(settings.embeddingProvider).toBe('ollama')
    expect(settings.embeddingModel).toBe('snowflake-arctic-embed2')
  })

  it('ensureDemoProject creates the demo project once and is idempotent', async () => {
    const id1 = await VersatileGenerate.ensureDemoProject()
    expect(id1).toBeTruthy()

    const project = await db.projects.get(id1)
    expect(project).toBeTruthy()
    expect(project.name).toBe(DEMO_TITLE)
    // A project also gets an empty manuscript so the dashboard has a store.
    const manuscript = await db.manuscripts.where('projectId').equals(id1).first()
    expect(manuscript).toBeTruthy()

    const id2 = await VersatileGenerate.ensureDemoProject()
    expect(id2).toBe(id1)

    const all = await db.projects.where('name').equals(DEMO_TITLE).toArray()
    expect(all.length).toBe(1)
  })
})
