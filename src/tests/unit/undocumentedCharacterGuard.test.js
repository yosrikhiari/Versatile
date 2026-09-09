import { describe, it, expect } from 'vitest'
import { createUndocumentedCharacterGuard } from '../../guardrails/guards/undocumentedCharacterGuard'

// Guards the tsc fix: this kind must exist in the GuardrailKind union and the
// registry metadata, or the guard's findings cannot be registered/reported.
function groundingWith(cast) {
  return {
    refresh: () => {},
    getEntitiesByType: (type) =>
      type === 'character' ? cast.map((name) => ({ name, aliases: [] })) : []
  }
}

const ctx = (content) => ({
  layer: 'ai_output',
  sceneId: 's1',
  data: { content }
})

describe('undocumentedCharacterGuard', () => {
  it('flags a person name missing from the cast with its kind', () => {
    const guard = createUndocumentedCharacterGuard(groundingWith(['Mara Voss']))
    const out = guard(ctx('Aiden Cross stepped from the shadows and Mara Voss watched him come.'))
    expect(out.length).toBeGreaterThan(0)
    expect(out[0].kind).toBe('undocumented_character')
    expect(out[0].passed).toBe(false)
    expect(out[0].message).toMatch(/Aiden Cross/)
  })

  it('stays silent when every name is documented', () => {
    const guard = createUndocumentedCharacterGuard(groundingWith(['Mara Voss', 'June Voss']))
    const out = guard(ctx('Mara Voss watched June Voss tie the boat.'))
    expect(out).toEqual([])
  })

  it('returns nothing when disabled', () => {
    const guard = createUndocumentedCharacterGuard(groundingWith([]), false)
    const out = guard(ctx('Aiden stepped from the shadows.'))
    expect(out).toEqual([])
  })
})
