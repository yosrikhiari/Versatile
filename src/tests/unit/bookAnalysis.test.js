import { describe, it, expect } from 'vitest'
import {
  chunkParagraphs,
  cleanExtraction,
  mergeExtractions,
  resolveNames,
  assignAlias,
  characterCounts,
  toStructured,
  nameTokens
} from '@/services/import/bookAnalysis'

const counts = (obj) => new Map(Object.entries(obj))

describe('resolveNames', () => {
  it('folds short forms and honorifics into the one full name that contains them', () => {
    const r = resolveNames(
      counts({
        'Sherlock Holmes': 3,
        Holmes: 40,
        'Mr. Holmes': 5,
        Watson: 20,
        'Dr. Watson': 4,
        'John Watson': 1,
        Irene: 2,
        'Irene Adler': 3
      })
    )
    expect(r.canonical.get('Holmes')).toBe('Sherlock Holmes')
    expect(r.canonical.get('Mr. Holmes')).toBe('Sherlock Holmes')
    expect(r.canonical.get('Dr. Watson')).toBe('John Watson')
    expect(r.canonical.get('Irene')).toBe('Irene Adler')
    expect(r.aliases.get('Sherlock Holmes').sort()).toEqual(['Holmes', 'Mr. Holmes'])
    expect(r.ambiguous).toEqual([])
  })

  it('never fuses two people on a shared surname; reports the short form instead', () => {
    const r = resolveNames(
      counts({
        'Ethan Frome': 30,
        'Zeena Frome': 10,
        'Mrs. Frome': 4,
        Mattie: 25,
        'Mattie Silver': 6
      })
    )
    expect(r.canonical.get('Ethan Frome')).toBe('Ethan Frome')
    expect(r.canonical.get('Zeena Frome')).toBe('Zeena Frome')
    expect(r.canonical.get('Mrs. Frome')).toBe('Mrs. Frome')
    expect(r.ambiguous).toEqual([
      { name: 'Mrs. Frome', candidates: ['Ethan Frome', 'Zeena Frome'] }
    ])
    expect(r.canonical.get('Mattie')).toBe('Mattie Silver')
    assignAlias(r, 'Mrs. Frome', 'Zeena Frome')
    expect(r.canonical.get('Mrs. Frome')).toBe('Zeena Frome')
    expect(r.aliases.get('Zeena Frome')).toEqual(['Mrs. Frome'])
    expect(r.ambiguous).toEqual([])
  })

  it('shows the most used spelling of the same name', () => {
    const r = resolveNames(counts({ 'MR. HOLMES': 1, 'Mr. Holmes': 9 }))
    expect(r.canonical.get('MR. HOLMES')).toBe('Mr. Holmes')
    expect(nameTokens('Dr. John  Watson')).toEqual(['john', 'watson'])
  })
})

describe('extraction records', () => {
  it('cleans whatever the model returned', () => {
    const e = cleanExtraction({
      summary: ' A. ',
      characters: [{ name: 'Holmes' }, { name: 'holmes' }, { name: '' }, 'junk'],
      places: null,
      keyFacts: ['x', 'X', 'y', 'z', 'w', 'v', 'u'],
      relationships: [
        { from: 'A', to: 'A', label: 'self' },
        { from: 'A', to: 'B', label: 'knows' }
      ]
    })
    expect(e.summary).toBe('A.')
    expect(e.characters.map((c) => c.name)).toEqual(['Holmes'])
    expect(e.places).toEqual([])
    expect(e.keyFacts).toHaveLength(5)
    expect(e.relationships).toEqual([{ from: 'A', to: 'B', label: 'knows' }])
  })

  it('merges a long scene’s parts and chunks at paragraph boundaries', () => {
    const a = cleanExtraction({
      summary: 'One.',
      characters: [{ name: 'A', role: 'first' }],
      keyFacts: ['f1']
    })
    const b = cleanExtraction({
      summary: 'Two.',
      characters: [{ name: 'A', role: 'second' }, { name: 'B' }],
      keyFacts: ['f2']
    })
    const m = mergeExtractions([a, b])
    expect(m.summary).toBe('One. Two.')
    expect(m.characters.map((c) => [c.name, c.role])).toEqual([
      ['A', 'first'],
      ['B', '']
    ])
    expect(m.keyFacts).toEqual(['f1', 'f2'])
    const p = ['w '.repeat(1000), 'w '.repeat(1000), 'w '.repeat(1000)]
    expect(chunkParagraphs(p, 2500)).toHaveLength(2)
    expect(chunkParagraphs(['w '.repeat(3000)], 2500)).toHaveLength(1)
  })

  it('becomes the writer’s structured record, in canonical names, minus minor people', () => {
    const e = cleanExtraction({
      summary: 'They meet.',
      characters: [
        { name: 'Holmes', role: 'detective' },
        { name: 'Sherlock Holmes' },
        { name: 'Porter' }
      ],
      places: [{ name: 'Baker Street', type: 'street' }],
      keyFacts: ['Watson is married.'],
      relationships: [
        { from: 'Holmes', to: 'Watson', label: 'friend of' },
        { from: 'Porter', to: 'Holmes', label: 'serves' }
      ]
    })
    const canon = new Map([
      ['Holmes', 'Sherlock Holmes'],
      ['Watson', 'John Watson']
    ])
    const s = toStructured(e, canon, (n) => n !== 'Porter')
    expect(s.metadataStatus).toBe('ok')
    expect(s.usedEntities.characterNames).toEqual(['Sherlock Holmes', 'Porter'])
    expect(s.newEntities.characters.map((c) => [c.name, c.role])).toEqual([
      ['Sherlock Holmes', 'detective'],
      // In a link, so in the bible (the network drops links to unknown names).
      ['John Watson', 'unknown']
    ])
    expect(s.newEntities.locations).toEqual([
      { name: 'Baker Street', type: 'street', description: '' }
    ])
    expect(s.networkEvents).toEqual([
      { from: 'John Watson', to: 'Sherlock Holmes', label: 'friends with' }
    ])
  })

  it('counts every name form a book uses', () => {
    const e = cleanExtraction({
      pov: 'Ethan',
      characters: [{ name: 'Ethan' }],
      relationships: [{ from: 'Ethan', to: 'Zeena', label: 'married to' }]
    })
    expect(Object.fromEntries(characterCounts([e, e]))).toEqual({ Ethan: 6, Zeena: 2 })
  })
})

describe('what the live Ethan Frome read got wrong (27 Sep)', async () => {
  const { resolvePlaces, familyVote, nameGender } = await import('@/services/import/bookAnalysis')

  it('a bare first name is not an alias of a titled person; "Mr. X" and "X" still merge', () => {
    const r = resolveNames(
      counts({ 'Mrs. Ned Hale': 3, Ned: 2, 'Mrs. Hale': 2, Holmes: 5, 'Mr. Holmes': 2 })
    )
    expect(r.canonical.get('Ned')).toBe('Ned')
    expect(r.canonical.get('Mrs. Hale')).toBe('Mrs. Ned Hale')
    expect(r.canonical.get('Holmes')).toBe('Holmes')
    expect(r.canonical.get('Mr. Holmes')).toBe('Holmes')
    expect(nameGender('Mrs. Ned Hale')).toBe('f')
  })

  it('places: articles and possessives folded, the one longer name absorbs a short form, bare nouns kept only when recurring', () => {
    const p = resolvePlaces(
      counts({
        'Starkfield, Massachusetts': 1,
        Starkfield: 6,
        'Frome farm': 2,
        'The Frome Farm': 1,
        "Fromes' farm": 1,
        Farm: 1,
        Kitchen: 1,
        'The kitchen': 1,
        Church: 1,
        'The church': 1
      })
    )
    expect(p.canonical.get('Starkfield, Massachusetts')).toBe('Starkfield')
    expect(p.canonical.get('The Frome Farm')).toBe('Frome farm')
    expect(p.canonical.get("Fromes' farm")).toBe('Frome farm')
    expect(p.canonical.get('Farm')).toBe('Frome farm')
    expect(p.canonical.get('The church')).toBe(p.canonical.get('Church'))
    expect(p.keep('Starkfield')).toBe(true)
    expect(p.keep('Frome farm')).toBe(true)
    // "Kitchen" (2 scenes) and "Church" (2) are kinds of place, not places.
    expect(p.keep(p.canonical.get('Kitchen'))).toBe(false)
    expect(p.keep(p.canonical.get('Church'))).toBe(false)
  })

  it('a family link one scene claims is dropped; one the book repeats stays', () => {
    const ex = (rels) => cleanExtraction({ relationships: rels })
    const vote = familyVote(
      [
        ex([{ from: 'Ethan', to: 'Zeena', label: 'married to' }]),
        ex([
          { from: 'Zeena Frome', to: 'Ethan', label: 'wife' },
          { from: 'Ethan', to: 'Mattie', label: 'father' }
        ]),
        ex([{ from: 'Ethan', to: 'Mattie', label: 'loves' }])
      ],
      new Map([
        ['Ethan', 'Ethan Frome'],
        ['Zeena', 'Zeena Frome']
      ])
    )
    expect(vote('Ethan Frome', 'Zeena Frome', 'husband')).toBe(true)
    expect(vote('Ethan', 'Mattie', 'father')).toBe(false)
    expect(vote('Ethan', 'Mattie', 'loves')).toBe(true)
  })
})

describe('the second live read (27 Sep): names, marriages, relation types', async () => {
  const { familyVote, normalizeRelation } = await import('@/services/import/bookAnalysis')

  it('a name loses its bracketed note', () => {
    const e = cleanExtraction({
      pov: 'Ethan (the narrator)',
      characters: [{ name: 'Zeena (his wife)' }],
      relationships: [{ from: 'Zeena (his wife)', to: 'Ethan', label: 'wife of' }]
    })
    expect(e.characters[0].name).toBe('Zeena')
    expect(e.relationships[0].from).toBe('Zeena')
    expect(e.pov).toBe('Ethan')
  })

  it('marriage is exclusive: the partner the book repeats most wins', () => {
    const ex = (rels) => cleanExtraction({ relationships: rels })
    const zeena = { from: 'Ethan', to: 'Zeena', label: 'married to' }
    const mattie = { from: 'Ethan', to: 'Mattie', label: 'married to' }
    const vote = familyVote(
      [ex([zeena]), ex([zeena]), ex([zeena, mattie]), ex([mattie])],
      new Map()
    )
    expect(vote('Ethan', 'Zeena', 'husband')).toBe(true)
    expect(vote('Ethan', 'Mattie', 'married to')).toBe(false)
  })

  it('relation wordings fold into the network types', () => {
    const t = (l) => normalizeRelation(l).label
    expect(
      ['loves', 'has romantic feelings for', 'emotionally attached', 'in love'].map(t)
    ).toEqual(Array(4).fill('in love with'))
    expect(['husband', 'married to', 'wife of'].map(t)).toEqual(Array(3).fill('married to'))
    expect([t('employer of'), t('servant to'), t('hired help')]).toEqual([
      'employs',
      'works for',
      'works for'
    ])
    expect([t('ex-lover'), t('cousin'), t('outwits the detective')]).toEqual([
      'formerly close to',
      'cousin of',
      'outwits the detective'
    ])
    expect(normalizeRelation('married to').symmetric).toBe(true)
    expect(normalizeRelation('loves').symmetric).toBe(false)
  })
})

describe('stabilizeRelations', async () => {
  const { stabilizeRelations } = await import('@/services/import/bookAnalysis')
  const scene = (...events) => ({
    networkEvents: events.map(([from, label, to]) => ({ from, to, label }))
  })

  it('keeps a marriage through moods, and only sends real changes', () => {
    const book = [
      [scene(['Ethan', 'married to', 'Zeena'], ['Ethan', 'acquainted with', 'Mattie'])],
      [scene(['Ethan', 'cares for', 'Zeena'], ['Ethan', 'in love with', 'Mattie'])],
      [scene(['Zeena', 'married to', 'Ethan'], ['Ethan', 'acquainted with', 'Mattie'])],
      [scene(['Ethan', 'formerly close to', 'Mattie'])]
    ]
    stabilizeRelations(book)
    const sent = book.map((ch) => ch[0].networkEvents.map((e) => `${e.from} ${e.label} ${e.to}`))
    expect(sent).toEqual([
      ['Ethan married to Zeena', 'Ethan acquainted with Mattie'],
      ['Ethan in love with Mattie'],
      [],
      ['Ethan formerly close to Mattie']
    ])
  })
})
