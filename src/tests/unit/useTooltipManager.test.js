import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTooltipManager } from '../../composables/useTooltipManager'

describe('useTooltipManager', () => {
  let manager

  beforeEach(() => {
    vi.resetModules()
    manager = useTooltipManager()
  })

  it('returns setActive, clear, and isActive functions', () => {
    expect(manager.setActive).toBeTypeOf('function')
    expect(manager.clear).toBeTypeOf('function')
    expect(manager.isActive).toBeTypeOf('function')
  })

  it('isActive returns false for unknown id', () => {
    expect(manager.isActive('unknown')).toBe(false)
  })

  it('setActive makes isActive return true for that id', () => {
    manager.setActive('tooltip-1')
    expect(manager.isActive('tooltip-1')).toBe(true)
  })

  it('setActive changes active id', () => {
    manager.setActive('tooltip-1')
    manager.setActive('tooltip-2')
    expect(manager.isActive('tooltip-1')).toBe(false)
    expect(manager.isActive('tooltip-2')).toBe(true)
  })

  it('clear resets active id', () => {
    manager.setActive('tooltip-1')
    manager.clear()
    expect(manager.isActive('tooltip-1')).toBe(false)
  })
})
