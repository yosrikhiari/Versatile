import { describe, it, expect } from 'vitest'
import {
  tenseMarkers,
  narrativeTense,
  tenseDrift,
  paragraphsOf,
  presentParagraphs,
  presentStretch,
  tenseRule
} from '@/services/whatIf/tense'

const past = 'She walked to the door and looked out. The yard was empty; she stood and waited.'
const present = 'She walks to the door and looks out. The yard is empty; she stands and waits.'
const scene = (p, n = 4) => Array.from({ length: n }, () => p).join('\n\n')

describe('narrative tense (§45)', () => {
  it('counts past and present forms in the narration, not in speech', () => {
    expect(tenseMarkers(past)).toEqual({ past: 5, present: 0 })
    expect(tenseMarkers(present)).toEqual({ past: 0, present: 5 })
    // speech is naturally present tense: a past-tense scene full of it stays past
    const talky = `${past} “It is late,” she said. “He is here, he knows.”`
    expect(tenseMarkers(talky).present).toBe(0)
    expect(tenseMarkers('I walk home and I see the light.').present).toBe(2)
  })

  it('past, present, or unclear with too few markers or a mix', () => {
    expect(narrativeTense(scene(past)).tense).toBe('past')
    expect(narrativeTense(scene(present)).tense).toBe('present')
    expect(narrativeTense(past).tense).toBe('unclear')
    expect(narrativeTense(`${scene(past, 2)}\n\n${scene(present, 2)}`).tense).toBe('unclear')
  })

  it('a speech over several paragraphs is speech; a whole scene told as one is narration', () => {
    const open = '“It is a law of nature that he knows, and he sees it and says so'
    expect(paragraphsOf(`${past}\n\n${open}\n\n${past}`)).toHaveLength(2)
    // The Time Machine: every paragraph opens a quote that never closes
    const told = scene(`“${past}`)
    expect(paragraphsOf(told)).toHaveLength(4)
    expect(narrativeTense(told).tense).toBe('past')
  })

  it('a rewrite in another tense than its original is a drift; the same tense is not', () => {
    expect(tenseDrift(scene(past), scene(present))).toMatchObject({ from: 'past', to: 'present' })
    expect(tenseDrift(scene(present), scene(past))).toMatchObject({ from: 'present', to: 'past' })
    expect(tenseDrift(scene(past), scene(past))).toBeNull()
    expect(tenseDrift(scene(past), present)).toBeNull()
  })

  it('a past-tense rewrite that slides into the present for a stretch is caught', () => {
    const original = scene(past, 8)
    const slid = [past, past, past, present, present, past, past, past].join('\n\n')
    expect(presentParagraphs(slid).map((p) => p.index)).toEqual([3, 4])
    expect(presentStretch(original, slid)).toMatchObject({ added: 2 })
    // one paragraph is not a stretch; the original's own present paragraphs
    // (a timeless remark) do not count against the rewrite
    const one = [past, past, past, present, past, past, past, past].join('\n\n')
    expect(presentStretch(original, one)).toBeNull()
    const withRemarks = [past, past, past, present, present, past, past, past].join('\n\n')
    expect(presentStretch(withRemarks, slid)).toBeNull()
    // a whole-scene switch is tenseDrift's, not a stretch
    expect(presentStretch(original, scene(present, 8))).toBeNull()
  })

  it('the brief rule names the tense to keep', () => {
    expect(tenseRule('past')).toContain('TENSE: past tense')
    expect(tenseRule('present')).toContain('TENSE: present tense')
    expect(tenseRule('unclear')).toBe('')
  })
})
