import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GenerationStages from '@/components/story/GenerationStages.vue'

const STAGE_LABELS = [
  'Preparing story elements',
  'Planning chapters',
  'Building the story spine',
  'Writing scenes',
  'Checking continuity',
  'Saving'
]

/** Read each row's status from its icon/marker, the way a user reads it. */
function statuses(wrapper) {
  return wrapper.findAll('li').map((li) => {
    const text = li.text()
    if (text.includes('— done')) return 'done'
    if (text.includes('— in progress')) return 'current'
    return 'pending'
  })
}

function mountAt(phase, props = {}) {
  return mount(GenerationStages, { props: { phase, ...props } })
}

describe('GenerationStages', () => {
  it('lists every pipeline stage in order', () => {
    const w = mountAt('writing')
    const rows = w.findAll('li')
    expect(rows).toHaveLength(STAGE_LABELS.length)
    STAGE_LABELS.forEach((label, i) => expect(rows[i].text()).toContain(label))
  })

  it('marks earlier stages done and later ones pending', () => {
    // The whole point: "a list of completed and remaining steps" (NN/g), which
    // is the honest alternative when a percentage cannot be estimated.
    expect(statuses(mountAt('writing'))).toEqual([
      'done',
      'done',
      'done',
      'current',
      'pending',
      'pending'
    ])
  })

  it('maps every routing-table phase to exactly one active stage', () => {
    // A phase missing from the map renders no active step, which reads as a
    // stall. spine-generation had no UI at all before this component existed.
    const phases = [
      'volume-creating',
      'bootstrapping',
      'planning',
      'plan-preview',
      'spine-generation',
      'writing',
      'scene-review',
      'sync-preview',
      'repairing',
      'consistency-check',
      'consistency-fix',
      'committing'
    ]
    for (const phase of phases) {
      const current = statuses(mountAt(phase)).filter((s) => s === 'current')
      expect(current, `phase "${phase}" should map to one active stage`).toHaveLength(1)
    }
  })

  it('groups sub-phases under their parent stage', () => {
    // scene-review and sync-preview are still "Writing scenes" to a user.
    const write = statuses(mountAt('writing'))
    expect(statuses(mountAt('scene-review'))).toEqual(write)
    expect(statuses(mountAt('sync-preview'))).toEqual(write)
  })

  it('shows every stage done when complete', () => {
    expect(statuses(mountAt('complete'))).toEqual(Array(STAGE_LABELS.length).fill('done'))
  })

  it('renders nothing on error — the error block owns that state', () => {
    expect(mountAt('error').find('ol').exists()).toBe(false)
  })

  it('shows no active stage for an unmapped phase rather than guessing', () => {
    const s = statuses(mountAt('some-future-phase'))
    expect(s.every((x) => x === 'pending')).toBe(true)
  })

  it('reports the real scene count under the writing stage', () => {
    const w = mountAt('writing', { currentScene: 4, totalScenes: 30 })
    expect(w.text()).toContain('Scene 4 of 30')
  })

  it('does not invent a scene count before the plan exists', () => {
    const w = mountAt('writing', { currentScene: 0, totalScenes: 0, statusText: 'Starting…' })
    expect(w.text()).not.toContain('Scene 0 of 0')
    expect(w.text()).toContain('Starting…')
  })

  it('shows statusText only under the active stage', () => {
    const w = mountAt('planning', { statusText: 'Outlining chapters' })
    const rows = w.findAll('li')
    expect(rows[1].text()).toContain('Outlining chapters')
    expect(rows[0].text()).not.toContain('Outlining chapters')
    expect(rows[3].text()).not.toContain('Outlining chapters')
  })

  it('marks the active row with aria-current for screen readers', () => {
    const rows = mountAt('writing').findAll('li')
    expect(rows[3].attributes('aria-current')).toBe('step')
    expect(rows[0].attributes('aria-current')).toBeUndefined()
  })
})
