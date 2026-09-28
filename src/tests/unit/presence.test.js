import { describe, it, expect } from 'vitest'
import {
  namedAbsence,
  trackedCharacters,
  mentions,
  presencePrompt,
  decidePresence
} from '@/services/whatIf/presence'

const bible = [
  { name: 'Zeena Frome', aliases: ['Zeena'] },
  { name: 'Ethan Frome', aliases: ['Ethan'] },
  { name: 'Mattie Silver', aliases: ['Mattie'] },
  { name: 'Denis Eady' }
]
const zeena = { name: 'Zeena Frome', forms: ['Zeena Frome', 'Zeena'] }

describe('trackedCharacters', () => {
  it('tracks the people the change names, by any form', () => {
    const t = trackedCharacters(
      'Zeena never goes to Bettsbridge, and stays home the night Ethan and Mattie were to be alone.',
      bible
    )
    expect(t.map((c) => c.name)).toEqual(['Zeena Frome', 'Ethan Frome', 'Mattie Silver'])
    expect(t[0].forms).toEqual(['Zeena Frome', 'Zeena'])
    // "Frome" is Ethan's too: as a form it would put Zeena in every Ethan scene
    expect(mentions('Ethan Frome stood at the gate.', t[0])).toBe(false)
    expect(trackedCharacters('Denis came.', bible)[0].forms).toEqual([
      'Denis Eady',
      'Denis',
      'Eady'
    ])
    expect(mentions('After Zeena left, the house was quiet.', t[0])).toBe(true)
    expect(mentions('Zeenath came.', t[0])).toBe(false)
  })
})

describe('decidePresence', () => {
  const vii = { present: true, where: 'at home at the farm', scene: 'VII' }
  const viii =
    "Zeena's absence was like a door left open in the cold. The stove had gone quiet after Zeena left. Ethan stood in the kitchen."

  it('chapter VIII: last shown at home, treated as gone, never shown leaving -> a missing event', () => {
    const r = decidePresence(
      {
        present: 'no',
        where: '',
        shownLeaving: '',
        shownReturn: '',
        assumesAway: 'The stove had gone quiet after Zeena left.'
      },
      viii,
      zeena,
      vii,
      'VIII'
    )
    expect(r.issue).toEqual({
      sentence: 'The stove had gone quiet after Zeena left.',
      fact: 'Zeena Frome is still at home at the farm: last shown there in VII, and the story never shows Zeena Frome leaving.'
    })
    expect(r.next).toEqual(vii)
  })

  it('a leaving the scene shows is not an issue, and moves the person', () => {
    const prose = 'At noon Zeena drove off to Bettsbridge. After Zeena left, Ethan sat down.'
    const r = decidePresence(
      {
        present: 'no',
        where: 'Bettsbridge',
        shownLeaving: 'At noon Zeena drove off to Bettsbridge.',
        assumesAway: 'After Zeena left, Ethan sat down.'
      },
      prose,
      zeena,
      vii,
      'VIII'
    )
    expect(r.issue).toBeNull()
    expect(r.next).toEqual({ present: false, where: 'Bettsbridge', scene: 'VIII' })
  })

  it('quotes must be in the text; no earlier sighting means nothing to break', () => {
    expect(
      decidePresence(
        { present: 'no', assumesAway: 'Zeena had gone for good.' },
        viii,
        zeena,
        vii,
        'VIII'
      ).issue
    ).toBeNull()
    expect(
      decidePresence(
        { present: 'no', assumesAway: 'The stove had gone quiet after Zeena left.' },
        viii,
        zeena,
        null,
        'VIII'
      ).issue
    ).toBeNull()
  })

  it('the live chapter VIII: a RETURN with no leaving shown is the missing event, not its excuse', () => {
    const prose =
      "Zeena's return came late, her footsteps slow on the porch steps. Zeena's absence left the house hushed."
    const r = decidePresence(
      {
        present: 'no',
        where: '',
        shownLeaving: '',
        shownReturn: "Zeena's return came late, her footsteps slow on the porch steps.",
        assumesAway: "Zeena's absence left the house hushed."
      },
      prose,
      zeena,
      vii,
      'VIII'
    )
    expect(r.issue?.sentence).toBe("Zeena's absence left the house hushed.")
    // present in the scene, but shown coming back: still a leaving never shown
    const back = decidePresence(
      {
        present: 'yes',
        where: 'on the porch',
        shownLeaving: '',
        shownReturn: "Zeena's return came late, her footsteps slow on the porch steps.",
        assumesAway: ''
      },
      prose,
      zeena,
      vii,
      'VIII'
    )
    expect(back.issue?.sentence).toBe(
      "Zeena's return came late, her footsteps slow on the porch steps."
    )
  })

  it('plain presence quoted as a leaving does not excuse an absence', () => {
    const prose = 'Zeena stood at the door. After Zeena left, the stove went cold.'
    const r = decidePresence(
      {
        present: 'no',
        where: '',
        shownLeaving: 'Zeena stood at the door.',
        shownReturn: '',
        assumesAway: 'After Zeena left, the stove went cold.'
      },
      prose,
      zeena,
      vii,
      'VIII'
    )
    expect(r.issue?.sentence).toBe('After Zeena left, the stove went cold.')
  })

  it('the second live run: quotes about someone else, arrivals and absences are not evidence', () => {
    const ethan = { name: 'Ethan Frome', forms: ['Ethan Frome', 'Ethan'] }
    const atBarn = { present: true, where: 'by the barn door', scene: 'VII' }
    // asked about Ethan, the model quoted Zeena's absence
    expect(
      decidePresence(
        {
          present: 'no',
          shownLeaving: '',
          shownReturn: '',
          assumesAway: "Zeena's absence was like a door left open in the cold."
        },
        "Zeena's absence was like a door left open in the cold.",
        ethan,
        atBarn,
        'VIII'
      ).issue
    ).toBeNull()
    // walking into a room is not coming back
    const mattie = { name: 'Mattie Silver', forms: ['Mattie Silver', 'Mattie'] }
    expect(
      decidePresence(
        {
          present: 'yes',
          shownLeaving: '',
          shownReturn: 'Mattie appeared behind them, her sleeves rolled up.',
          assumesAway: ''
        },
        'Mattie appeared behind them, her sleeves rolled up.',
        mattie,
        { present: true, where: 'near the hearth', scene: 'V' },
        'VI'
      ).issue
    ).toBeNull()
  })

  it('a leaving is the person leaving: not someone else, not an absence, not an earlier one', () => {
    const not = [
      'In the hall, Zeena waited until he had gone, then crossed to the window.',
      "Zeena's absence left the house hushed.",
      'Zeena had left before dawn, and the house was cold.'
    ]
    for (const q of not) {
      const r = decidePresence(
        { present: 'no', shownLeaving: q, shownReturn: '', assumesAway: '' },
        q,
        zeena,
        vii,
        'V'
      )
      expect(r.next, q).toEqual(vii)
    }
    const shown = 'At noon Zeena drove off to Bettsbridge.'
    expect(
      decidePresence(
        {
          present: 'no',
          where: 'Bettsbridge',
          shownLeaving: shown,
          shownReturn: '',
          assumesAway: ''
        },
        shown,
        zeena,
        vii,
        'V'
      ).next
    ).toEqual({ present: false, where: 'Bettsbridge', scene: 'V' })
  })

  it('trial 2: an unnamed quote falls back to the sentence that puts the name next to an absence', () => {
    const prose =
      "Zeena hadn't come. Her things remained in their place, untouched. Zeena wasn’t coming. Ethan felt Zeena's absence like cold."
    const r = decidePresence(
      {
        present: 'no',
        shownLeaving: '',
        shownReturn: '',
        assumesAway: 'Her things remained in their place, untouched.'
      },
      prose,
      zeena,
      vii,
      'VIII'
    )
    expect(r.issue?.sentence).toBe("Zeena hadn't come.")
    // the same fallback never makes Ethan "away" from Zeena's absence
    const ethan = { name: 'Ethan Frome', forms: ['Ethan Frome', 'Ethan'] }
    expect(
      decidePresence(
        {
          present: 'no',
          shownLeaving: '',
          shownReturn: '',
          assumesAway: 'Her things remained in their place, untouched.'
        },
        prose,
        ethan,
        { present: true, where: 'in the kitchen', scene: 'VII' },
        'VIII'
      ).issue
    ).toBeNull()
    // and not when the model says the person is here
    expect(
      decidePresence(
        {
          present: 'yes',
          shownLeaving: '',
          shownReturn: '',
          assumesAway: 'Her things remained in their place, untouched.'
        },
        prose,
        zeena,
        vii,
        'VIII'
      ).issue
    ).toBeNull()
  })

  it('a scene that shows the person sets where they are', () => {
    const r = decidePresence(
      {
        present: 'yes',
        where: 'in the kitchen',
        shownLeaving: '',
        shownReturn: '',
        assumesAway: ''
      },
      'Zeena sat in the kitchen.',
      zeena,
      null,
      'IV'
    )
    expect(r.next).toEqual({ present: true, where: 'in the kitchen', scene: 'IV' })
  })

  it('the prompt carries the last sighting and asks reason-first, quote-first', () => {
    const p = presencePrompt({ who: zeena, last: vii, sceneTitle: 'VIII', prose: viii })
    expect(p).toContain('last shown present: at home at the farm (VII)')
    expect(p.indexOf('"present"')).toBeLessThan(p.indexOf('"shownLeaving"'))
    expect(p.indexOf('"shownReturn"')).toBeLessThan(p.indexOf('"assumesAway"'))
  })
})

describe('namedAbsence', () => {
  const zeena = { name: 'Zeena Frome', forms: ['Zeena Frome', 'Zeena'] }
  it('finds the name next to an absence, and only there', () => {
    for (const yes of [
      "Zeena's absence left the house hushed.",
      'Zeena was gone by morning.',
      'Zeena wasn’t coming.',
      "Zeena hadn't come.",
      'He felt the absence of Zeena like cold.'
    ])
      expect(namedAbsence(yes, zeena), yes).toBe(yes)
    for (const no of [
      'Zeena only looked away, toward the fire.',
      'Zeena turned toward the stairs, walking away from it.',
      'Since the day Zeena left for Bettsbridge, nothing had changed.'
    ])
      expect(namedAbsence(no, zeena), no).toBe('')
  })
})

describe('another time is not gone now (§42)', () => {
  const zeena = { name: 'Zeena Frome', forms: ['Zeena Frome', 'Zeena'] }
  const ethan = { name: 'Ethan Frome', forms: ['Ethan Frome', 'Ethan'] }
  const mattie = { name: 'Mattie Silver', forms: ['Mattie Silver', 'Mattie'] }
  const here = { present: true, where: 'at home', scene: 'VII' }
  const away = (who, q, prose = q) =>
    decidePresence(
      { present: 'no', shownLeaving: '', shownReturn: '', assumesAway: q },
      prose,
      who,
      here,
      'X'
    ).issue?.sentence ?? null

  it('the four false alarms counted in §41 are not flagged', () => {
    expect(away(ethan, 'Only I always try to pick a day when Ethan’s off somewheres.')).toBeNull()
    expect(
      away(zeena, 'Zeena Frome had sent Mattie off in a hurry because she had a hired girl coming,')
    ).toBeNull()
    expect(
      away(mattie, 'He thought about Mattie—how she had laughed when he first brought her home')
    ).toBeNull()
    expect(
      away(
        mattie,
        'He dropped his coat on the chair by the hearth—same place Mattie had sat just hours ago.'
      )
    ).toBeNull()
  })

  it('the real ones still are, memory words or not', () => {
    for (const q of [
      'The silence of Zeena’s absence allowed the cold to settle without resistance.',
      'Zeena wasn’t coming.',
      'He looked away, toward the trees where the wind had carried Zeena’s absence all winter long.',
      'Zeena’s gone, but she’ll come back.',
      "Zeena hadn't returned yet.",
      'He thought of Zeena’s absence, of the way she’d left without warning.'
    ])
      expect(away(zeena, q), q).toBe(q)
  })

  it('a set-aside quote falls back to the scene’s own named absence; "after she left" is plain', () => {
    const prose =
      "He thought about Zeena, how she had laughed. Zeena's absence left the house hushed."
    expect(away(zeena, 'He thought about Zeena, how she had laughed.', prose)).toBe(
      "Zeena's absence left the house hushed."
    )
    expect(away(zeena, 'The stove had gone quiet after Zeena left.')).toBe(
      'The stove had gone quiet after Zeena left.'
    )
  })
})
