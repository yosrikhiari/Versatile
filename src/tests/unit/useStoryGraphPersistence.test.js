import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useStoryGraphPersistence } from '@/composables/useStoryGraphPersistence'

function mountPersistence({ groups = [], parents = {}, projectId = 'p1' } = {}) {
  const saveGroups = vi.fn()
  const saveParents = vi.fn()
  let refs = null
  const Comp = defineComponent({
    setup() {
      const manualGroups = ref(structuredClone(groups))
      const nodeParents = ref(structuredClone(parents))
      useStoryGraphPersistence(manualGroups, nodeParents, () => projectId, saveGroups, saveParents)
      refs = { manualGroups, nodeParents }
      return () => h('div')
    }
  })
  const wrapper = mount(Comp)
  return { wrapper, refs, saveGroups, saveParents }
}

describe('useStoryGraphPersistence', () => {
  let wrappers

  beforeEach(() => {
    vi.useFakeTimers()
    wrappers = []
  })

  afterEach(() => {
    wrappers.forEach((w) => {
      try {
        w.unmount()
      } catch {
        // already unmounted in-test
      }
    })
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('debounces group saves instead of writing per mutation', async () => {
    const { wrapper, refs, saveGroups } = mountPersistence()
    wrappers.push(wrapper)

    refs.manualGroups.value.push({ id: 'g1', x: 0, y: 0 })
    refs.manualGroups.value.push({ id: 'g2', x: 10, y: 10 })
    await refs.manualGroups.value // flush reactivity
    expect(saveGroups).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)
    expect(saveGroups).toHaveBeenCalledTimes(1)
    expect(saveGroups).toHaveBeenCalledWith(
      'p1',
      expect.arrayContaining([
        expect.objectContaining({ id: 'g1' }),
        expect.objectContaining({ id: 'g2' })
      ])
    )
  })

  it('debounces node-parent saves', async () => {
    const { wrapper, refs, saveParents } = mountPersistence()
    wrappers.push(wrapper)

    refs.nodeParents.value['char-1'] = 'g1'
    await Promise.resolve()
    expect(saveParents).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)
    expect(saveParents).toHaveBeenCalledTimes(1)
    expect(saveParents).toHaveBeenCalledWith('p1', { 'char-1': 'g1' })
  })

  it('writes nothing without a project id', async () => {
    const { wrapper, refs, saveGroups, saveParents } = mountPersistence({ projectId: null })
    wrappers.push(wrapper)

    refs.manualGroups.value.push({ id: 'g1' })
    refs.nodeParents.value['char-1'] = 'g1'
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(2000)

    expect(saveGroups).not.toHaveBeenCalled()
    expect(saveParents).not.toHaveBeenCalled()
  })

  it('flushes pending writes on unmount instead of dropping them', async () => {
    const { wrapper, refs, saveGroups } = mountPersistence()
    wrappers.push(wrapper)

    refs.manualGroups.value.push({ id: 'g9', x: 1, y: 2 })
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(200)
    expect(saveGroups).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(saveGroups).toHaveBeenCalledTimes(1)
    expect(saveGroups).toHaveBeenCalledWith(
      'p1',
      expect.arrayContaining([expect.objectContaining({ id: 'g9' })])
    )
  })

  it('clean unmount writes nothing', async () => {
    const { wrapper, saveGroups, saveParents } = mountPersistence()
    wrappers.push(wrapper)

    await vi.advanceTimersByTimeAsync(2000)
    wrapper.unmount()

    expect(saveGroups).not.toHaveBeenCalled()
    expect(saveParents).not.toHaveBeenCalled()
  })
})
