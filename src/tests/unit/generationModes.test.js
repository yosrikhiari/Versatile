import { describe, it, expect } from 'vitest'
import {
  MODE_ARC,
  MODE_CHAPTER,
  MODE_SCENE,
  MODE_BRAINSTORM
} from '../../constants/generationModes'

describe('generationModes', () => {
  it('exports MODE_ARC as "arc"', () => {
    expect(MODE_ARC).toBe('arc')
  })

  it('exports MODE_CHAPTER as "chapter"', () => {
    expect(MODE_CHAPTER).toBe('chapter')
  })

  it('exports MODE_SCENE as "scene"', () => {
    expect(MODE_SCENE).toBe('scene')
  })

  it('exports MODE_BRAINSTORM as "brainstorm"', () => {
    expect(MODE_BRAINSTORM).toBe('brainstorm')
  })
})
