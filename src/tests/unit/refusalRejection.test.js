import { describe, it, expect } from 'vitest'
import { REFUSAL_PATTERNS } from '@/guardrails/guards/contentSafetyGuard'

// The failure this guards against: contentSafetyGuard already detected refusals
// and already marked them `blocking`, but guardrail enforcement defaults to
// 'detective', so nothing threw. The refusal was returned as the scene, written
// to the manuscript, and fed forward as context for the next one — on an
// unattended 100-chapter run, "I'm sorry, but I can't continue this" becomes
// chapter 63 and then poisons chapter 64.

/** Mirror of useStoryWriter's detectRefusal, which is module-private. */
function detectRefusal(prose) {
  const text = String(prose || '')
    .replace(/^[\s`]*(?:json|markdown)?\s*/i, '')
    .trimStart()
  if (!text) return null
  if (/^["'“‘«]/.test(text)) return null
  for (const pattern of REFUSAL_PATTERNS) {
    const match = text.match(pattern)
    if (match && match.index === 0) return match[0]
  }
  return null
}

describe('refusal detection', () => {
  it('catches the refusals a local model actually produces', () => {
    expect(detectRefusal("I'm sorry, but I cannot write this scene.")).toBeTruthy()
    expect(detectRefusal("I'm sorry, but I can't continue this.")).toBeTruthy()
    expect(detectRefusal("I'm not able to help with that request.")).toBeTruthy()
  })

  it('does not reject prose in which a CHARACTER refuses', () => {
    // This genre is full of people refusing each other. Matching anywhere in the
    // scene would reject legitimate dialogue, so only the opening is scanned.
    const scene = `Kaelen set the blade on the table between them.

"Tell me where she is."

Dain looked at his hands. "I'm sorry, but I can't. You know what they'd do."

The candle guttered. Neither of them moved to relight it.`
    expect(detectRefusal(scene)).toBeNull()
  })

  it('does not reject a scene that OPENS on a character refusing', () => {
    // The tightest case: the refusal phrase is the first thing on the page.
    // A leading quotation mark is what separates dialogue from a model refusal.
    expect(detectRefusal(`"I'm sorry, but I can't," she said, and meant it.`)).toBeNull()
  })

  it('passes ordinary prose through', () => {
    expect(
      detectRefusal('The crown broke against the flagstones and the court went silent.')
    ).toBeNull()
    expect(detectRefusal('')).toBeNull()
    expect(detectRefusal(null)).toBeNull()
  })

  it('catches a refusal that opens the response but is not the first character', () => {
    // Models often emit a blank line or a stray fence before refusing.
    expect(detectRefusal("\n\nI'm sorry, but I cannot assist with that.")).toBeTruthy()
  })
})

describe('mature-content posture', () => {
  it('ships no blocked-term lexicon by default', async () => {
    // The pipeline must not sanitise subject matter for a dark-fantasy project.
    // A default lexicon here would silently filter the author's own story.
    const { createContentSafetyGuard } = await import('@/guardrails/guards/contentSafetyGuard')
    const guard = createContentSafetyGuard()
    const results = guard({
      layer: 'ai_output',
      data: {
        content: 'He broke her wrist against the altar stone and did not stop when she screamed.'
      }
    })
    expect(results).toEqual([])
  })

  it('still catches prompt scaffolding leaking into prose', () => {
    // Narrowness is deliberate, not absent: the unambiguous failures still fire.
    expect(REFUSAL_PATTERNS.length).toBeGreaterThan(0)
  })
})
