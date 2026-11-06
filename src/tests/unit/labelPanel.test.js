import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const upsert = vi.hoisted(() => vi.fn(async (input) => ({ ...input, id: 'label-1' })))

vi.mock('@/stores/labelStore', () => ({
  useLabelStore: () => ({ upsert })
}))

import LabelPanel from '@/components/eval/LabelPanel.vue'

const stubs = {
  BasePanelHeader: true,
  BaseSection: true,
  BaseSegmented: true,
  BaseChip: true,
  BaseButton: {
    template: '<button @click="$emit(\'click\')"><slot /></button>'
  }
}

describe('LabelPanel stable scene identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the sceneId prop through to the saved label', async () => {
    const w = mount(LabelPanel, {
      props: {
        storyId: 'story-1',
        sceneId: 'sub-1',
        sceneTitle: 'Prologue',
        sceneExcerpt: 'Opening line.',
        wordCount: 120,
        reviewerName: 'Reviewer A'
      },
      global: { stubs }
    })

    await w.find('button').trigger('click')
    await flushPromises()

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: 'story-1',
        sceneId: 'sub-1',
        sceneTitle: 'Prologue',
        reviewerName: 'Reviewer A'
      })
    )
  })

  it('sends null rather than an empty string when no stable id is known', async () => {
    const w = mount(LabelPanel, {
      props: {
        storyId: 'story-1',
        sceneTitle: 'Prologue',
        reviewerName: 'Reviewer A'
      },
      global: { stubs }
    })

    await w.find('button').trigger('click')
    await flushPromises()

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ sceneId: null }))
  })
})
