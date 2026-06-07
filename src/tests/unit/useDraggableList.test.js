import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useDraggableList', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function create(options) {
    const mod = await import('../../composables/useDraggableList')
    return { ...mod, ...mod.useDraggableList(options) }
  }

  it('exports DRAG_OPTIONS with defaults', async () => {
    const { DRAG_OPTIONS } = await create()
    expect(DRAG_OPTIONS.animation).toBe(150)
    expect(DRAG_OPTIONS.ghostClass).toBe('ghost')
    expect(DRAG_OPTIONS.dragClass).toBe('drag')
  })

  it('isDragging starts false', async () => {
    const { isDragging } = await create()
    expect(isDragging.value).toBe(false)
  })

  it('startDrag sets isDragging to true', async () => {
    const { isDragging, startDrag } = await create()
    startDrag()
    expect(isDragging.value).toBe(true)
  })

  it('endDrag sets isDragging to false', async () => {
    const { isDragging, startDrag, endDrag } = await create()
    startDrag()
    endDrag()
    expect(isDragging.value).toBe(false)
  })

  it('handleReorder calls callback with list', async () => {
    const callback = vi.fn()
    const { handleReorder } = await create(callback)
    handleReorder([1, 2, 3], vi.fn())
    expect(callback).toHaveBeenCalledWith([1, 2, 3])
  })

  it('handleReorder calls local callback when no reorder callback given', async () => {
    const callback = vi.fn()
    const { handleReorder } = await create(callback)
    handleReorder([1, 2, 3])
    expect(callback).toHaveBeenCalledWith([1, 2, 3])
  })

  it('handleReorder calls both callback and local onReorder', async () => {
    const localCb = vi.fn()
    const reorderCb = vi.fn()
    const { handleReorder } = await create(localCb)
    handleReorder([1, 2, 3], reorderCb)
    expect(reorderCb).toHaveBeenCalledWith([1, 2, 3])
    expect(localCb).toHaveBeenCalledWith([1, 2, 3])
  })

  it('getDragOptions returns options with group', async () => {
    const { getDragOptions, DRAG_OPTIONS } = await create()
    const opts = getDragOptions('test-group')
    expect(opts.animation).toBe(DRAG_OPTIONS.animation)
    expect(opts.group).toBe('test-group')
  })

  it('getCloneDragOptions returns clone group options', async () => {
    const { getCloneDragOptions, DRAG_OPTIONS } = await create()
    const opts = getCloneDragOptions()
    expect(opts.group.name).toBe('clone')
    expect(opts.group.pull).toBe('clone')
    expect(opts.group.put).toBe(false)
  })
})
