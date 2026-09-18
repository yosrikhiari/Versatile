import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_ROLE_PLACEMENT,
  MULTI_AGENT_PRESET,
  applyRolePreset,
  getRolePlacement,
  placementProblems,
  resetRolePlacements,
  resolveRoleModel,
  resolveRolePlacement,
  setRolePlacement
} from '@/config/roles'
import { setOllamaModel, setOllamaUtilityModel } from '@/config/ollama'

beforeEach(() => {
  localStorage.clear()
  resetRolePlacements()
})

describe('role placement — defaults and inheritance', () => {
  it('every role defaults to the GPU with no model of its own', () => {
    for (const role of ['director', 'writer', 'critic', 'editor', 'utility']) {
      expect(getRolePlacement(role)).toEqual(DEFAULT_ROLE_PLACEMENT[role])
    }
  })

  it('writer and director inherit the prose model; critic, editor and utility inherit the utility model', () => {
    setOllamaModel('prose-model:1b')
    setOllamaUtilityModel('utility-model:1b')
    expect(resolveRoleModel('writer')).toBe('prose-model:1b')
    expect(resolveRoleModel('director')).toBe('prose-model:1b')
    expect(resolveRoleModel('critic')).toBe('utility-model:1b')
    expect(resolveRoleModel('editor')).toBe('utility-model:1b')
    expect(resolveRoleModel('utility')).toBe('utility-model:1b')
  })

  it('an explicit model wins over inheritance and survives a reload', () => {
    setRolePlacement('critic', { model: 'gemma3:4b', device: 'cpu' })
    expect(getRolePlacement('critic')).toMatchObject({ model: 'gemma3:4b', device: 'cpu' })
    expect(resolveRoleModel('critic')).toBe('gemma3:4b')
    // Garbage in storage never throws and never leaks: falls back to defaults.
    localStorage.setItem('versatile_role_placement_editor', '{not json')
    expect(getRolePlacement('editor')).toEqual(DEFAULT_ROLE_PLACEMENT.editor)
  })
})

describe('role placement — runtime (lane, num_gpu, keep_alive)', () => {
  it('a GPU role takes the gpu lane and leaves num_gpu to Ollama', () => {
    const rt = resolveRolePlacement('writer')
    expect(rt.lane).toBe('ollama:gpu')
    expect(rt.numGpu).toBeUndefined()
    expect(rt.keepAlive).toBe('30m')
  })

  it('a CPU role takes the cpu lane with num_gpu 0', () => {
    setRolePlacement('critic', { model: 'qwen2.5:3b-instruct', device: 'cpu', numCtx: 8192 })
    const rt = resolveRolePlacement('critic')
    expect(rt).toMatchObject({
      model: 'qwen2.5:3b-instruct',
      device: 'cpu',
      lane: 'ollama:cpu',
      numGpu: 0,
      numCtx: 8192
    })
  })
})

describe('role placement — the one hard rule', () => {
  it('two different GPU models is an error (a second GPU model evicts the first)', () => {
    setOllamaModel('qwen3:8b')
    setRolePlacement('critic', { model: 'gemma3:4b', device: 'gpu' })
    const problems = placementProblems()
    expect(problems.some((p) => p.level === 'error')).toBe(true)
    expect(problems.find((p) => p.level === 'error').message).toMatch(/evicts the first/)
  })

  it('the same model on the GPU for every role is allowed but warns that the judge is the author', () => {
    setOllamaModel('qwen3:8b')
    setOllamaUtilityModel('qwen3:8b')
    const problems = placementProblems()
    expect(problems.some((p) => p.level === 'error')).toBe(false)
    expect(
      problems.some((p) => p.level === 'warning' && /judge is the author/.test(p.message))
    ).toBe(true)
  })

  it('the multi-agent preset has no problems: one GPU model, a different CPU critic', () => {
    setOllamaModel('qwen3:8b')
    setOllamaUtilityModel('qwen3:8b')
    applyRolePreset(MULTI_AGENT_PRESET)
    expect(placementProblems()).toEqual([])
    expect(resolveRolePlacement('critic').lane).toBe('ollama:cpu')
    expect(resolveRolePlacement('writer').lane).toBe('ollama:gpu')
  })
})
