import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vue', () => ({
  onMounted: (cb) => cb(),
  onUnmounted: vi.fn(),
  unref: (v) => (v !== null && typeof v === 'object' && 'value' in v ? v.value : v)
}))

function dispatchOnBody(key, opts = {}) {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('calls onSearchClose on Escape in input', async () => {
    const onSearchClose = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({ onSearchClose })
    const input = document.createElement('INPUT')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onSearchClose).toHaveBeenCalledTimes(1)
    document.body.removeChild(input)
  })

  it('blurs input on Escape when no onSearchClose', async () => {
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({})
    const input = document.createElement('INPUT')
    document.body.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.activeElement).not.toBe(input)
    document.body.removeChild(input)
  })

  it('calls onToggleShortcuts on ?', async () => {
    const onToggleShortcuts = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({ onToggleShortcuts })
    dispatchOnBody('?')
    expect(onToggleShortcuts).toHaveBeenCalledTimes(1)
  })

  it('calls onExport on Ctrl+F', async () => {
    const onExport = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({ onExport })
    dispatchOnBody('f', { ctrlKey: true })
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it('calls onSave on Ctrl+S', async () => {
    const onSave = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({ onSave })
    dispatchOnBody('s', { ctrlKey: true })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleFlow on f (no modifiers) when timer not running', async () => {
    const onToggleFlow = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({ onToggleFlow, timerIsRunning: false })
    dispatchOnBody('f')
    expect(onToggleFlow).toHaveBeenCalledWith(true)
  })

  it('calls onToggleFlow on f (no modifiers) when timer running', async () => {
    const onToggleFlow = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({ onToggleFlow, timerIsRunning: true })
    dispatchOnBody('f')
    expect(onToggleFlow).toHaveBeenCalledWith(false)
  })

  it('follows a live timerIsRunning ref across presses (start then end)', async () => {
    const onToggleFlow = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    // A setup-time snapshot (`timerIsRunning: false`) would restart the
    // session on every press; a live ref toggles start/end correctly.
    const timerIsRunning = { value: false }
    useKeyboardShortcuts({ onToggleFlow, timerIsRunning })
    dispatchOnBody('f')
    expect(onToggleFlow).toHaveBeenLastCalledWith(true)
    timerIsRunning.value = true
    dispatchOnBody('f')
    expect(onToggleFlow).toHaveBeenLastCalledWith(false)
  })

  it('calls number action on key 1', async () => {
    const onToggleSpark = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({ onToggleSpark, appShell: true })
    dispatchOnBody('1')
    expect(onToggleSpark).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleStoryGenerator on g', async () => {
    const onToggleStoryGenerator = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({ onToggleStoryGenerator })
    dispatchOnBody('g')
    expect(onToggleStoryGenerator).toHaveBeenCalledTimes(1)
  })

  it('calls onCloseModal on Escape', async () => {
    const onCloseModal = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({ onCloseModal })
    dispatchOnBody('Escape')
    expect(onCloseModal).toHaveBeenCalledTimes(1)
  })

  it('ignores shortcuts when inside input', async () => {
    const onToggleSpark = vi.fn()
    const { useKeyboardShortcuts } = await import('../../composables/useKeyboardShortcuts')
    useKeyboardShortcuts({ onToggleSpark, appShell: true })
    const input = document.createElement('INPUT')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    expect(onToggleSpark).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })
})
