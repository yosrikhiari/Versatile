/**
 * A small sample project for a first run: one volume, two chapters, four
 * scenes of real prose, a story bible of three characters, two places and one
 * thread. It exists so a new writer can open every panel against something
 * true — the timeline, the shape, the consistency check, Compile — before
 * they have written a word. Seeds in well under a second; nothing here calls
 * a model.
 *
 * `seedDemoStory` is the other seeder: ten volumes and 300 templated scenes
 * for scale testing, dev-only, from the console.
 */
import { db } from './db-core'
import { countWords } from '../utils/textUtils'
import { ensureMainBranch } from './db-branches'

export const SAMPLE_PROJECT_NAME = 'The Long Night (sample)'

const CHARACTERS = [
  {
    name: 'Ilse',
    role: 'Protagonist',
    description:
      'Harbour clerk. Grey eyes. Counts boats, and everything else that does not want counting.',
    traits: ['exact', 'stubborn', 'unsentimental']
  },
  {
    name: 'Tomas',
    role: 'Harbour master',
    description:
      'Runs the harbour and keeps its ledger. Knows more about the missing boat than he says.',
    traits: ['careful', 'tired', 'loyal to the wrong people']
  },
  {
    name: 'Anneke',
    role: 'Supporting',
    description: "The Marguerite's skipper's sister. Wants the boat back more than the truth.",
    traits: ['loud', 'grieving', 'practical']
  }
]

const LOCATIONS = [
  {
    name: 'The harbour',
    description: 'Eleven berths, a stone quay, and an office that is dark by five.'
  },
  {
    name: "Anneke's kitchen",
    description: 'Above the chandlery. Smells of tar and coffee.'
  }
]

const THREAD = {
  title: 'The missing boat',
  status: 'active',
  notes:
    'The Marguerite left on the evening tide and was never logged back. The ledger says it never left.'
}

const CHAPTERS: Array<{
  title: string
  summary: string
  scenes: Array<{ title: string; paragraphs: string[]; characters: string[]; location: string }>
}> = [
  {
    title: 'The count',
    summary: 'Ilse counts the boats and comes up one short.',
    scenes: [
      {
        title: 'Counting the boats',
        location: 'The harbour',
        characters: ['Ilse', 'Tomas'],
        paragraphs: [
          'Ilse reached the harbour before the tide turned. The harbour master, Tomas, had already gone home; the office was dark, and somewhere behind it a dog was working through a long complaint.',
          'She counted the boats twice. Eleven, then ten. The Marguerite was gone. Ilse had grey eyes and a habit of counting things that did not want to be counted, and tonight the harbour did not care.',
          '“You are late,” said a voice from the dark. It was Tomas after all, holding a lamp he had not lit.',
          '“The Marguerite is out,” she said. “It is not in the book.”',
          '“Then it is not out.” He lit the lamp, finally, and did not look at the empty berth.'
        ]
      },
      {
        title: 'The ledger',
        location: 'The harbour',
        characters: ['Ilse', 'Tomas'],
        paragraphs: [
          'The ledger lived in the drawer that stuck. Ilse worked it open with the flat of her hand and turned to the evening page. Ten departures, ten returns, every line in Tomas’s careful, tired hand.',
          '“You wrote this before dark,” she said. It was not a question. The ink had dried in the shape of a man who wanted to be finished.',
          'Tomas set the lamp on the desk between them, where its light fell on the page and not on his face. “I write what the harbour tells me.”',
          '“The harbour has ten boats in it.”',
          '“Then the book is right.” He took the ledger back, closed it, and put it in the drawer that stuck. It stuck. He left it.'
        ]
      }
    ]
  },
  {
    title: 'The kitchen above the chandlery',
    summary: 'Anneke wants her brother’s boat back; Ilse wants the page that is missing.',
    scenes: [
      {
        title: 'Coffee and tar',
        location: "Anneke's kitchen",
        characters: ['Ilse', 'Anneke'],
        paragraphs: [
          'Anneke’s kitchen was one floor above the chandlery and smelled of both. She poured coffee without asking and put the cup down hard enough to say what she thought of clerks.',
          '“He is on that boat,” Anneke said. “My brother. And your book says the boat is in.”',
          '“The book says the boat never left.” Ilse did not touch the coffee. “I count boats, Anneke. I do not write the book.”',
          '“Then who does?”',
          'Ilse thought of the lamp Tomas had not lit, and of the drawer that stuck. “Someone who wanted to be finished before dark.”'
        ]
      },
      {
        title: 'The page that is missing',
        location: 'The harbour',
        characters: ['Ilse', 'Tomas', 'Anneke'],
        paragraphs: [
          'They came back to the harbour together, which was not how Ilse had planned it. Anneke walked ahead with the stride of someone who had decided to be angry at the sea.',
          'The office was lit this time. Tomas stood at the desk with the ledger open, and when he saw them he did not close it.',
          '“There is a page missing,” Ilse said.',
          '“There is.” He turned the book so they could see the stub of it, torn close to the spine. “I did not tear it. I only did not say.”',
          'Anneke put both hands on the desk. “Then say now.”',
          'Outside, the tide turned, and eleven berths held ten boats, and the dog behind the office finally stopped.'
        ]
      }
    ]
  }
]

function html(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p>${p}</p>`).join('')
}

/** Create the sample project for `userId` and return its id. Idempotent per user. */
export async function seedSampleStory(
  userId: number | string | null = null
): Promise<{ projectId: number | string; created: boolean }> {
  const existing = await db.projects
    .where('name')
    .equals(SAMPLE_PROJECT_NAME)
    .filter((p) => (userId == null ? true : p.userId === userId))
    .first()
  if (existing) return { projectId: existing.id, created: false }

  const now = new Date().toISOString()
  const projectId = await db.projects.add({
    userId,
    name: SAMPLE_PROJECT_NAME,
    genre: 'Literary',
    category: 'creative',
    description:
      'A harbour clerk counts the boats every night. One is missing, and the ledger says it never left.',
    createdAt: now,
    updatedAt: now
  })
  // The root document stays empty: the prose lives in the scenes (UX audit #19).
  await db.manuscripts.add({ projectId, content: '', wordCount: 0, updatedAt: now })
  // Sections and scenes are read through the active branch; rows without a
  // branchId are invisible to the manuscript store.
  const branch = await ensureMainBranch(projectId)
  const branchId = branch?.id ?? null

  const volumeId = await db.volumes.add({
    projectId,
    title: 'Volume 1',
    description: 'The count, the kitchen, the missing page.',
    sectionIds: [],
    volumeOrder: 0
  })

  await db.characters.bulkAdd(
    CHARACTERS.map((c) => ({
      projectId,
      generationStatus: 'approved',
      ...c,
      createdAt: now,
      updatedAt: now
    }))
  )
  await db.locations.bulkAdd(
    LOCATIONS.map((l) => ({
      projectId,
      generationStatus: 'approved',
      ...l,
      createdAt: now,
      updatedAt: now
    }))
  )
  await db.plotThreads.bulkAdd([
    { projectId, generationStatus: 'approved', ...THREAD, createdAt: now, updatedAt: now }
  ])

  let sceneNumber = 0
  for (let c = 0; c < CHAPTERS.length; c++) {
    const chapter = CHAPTERS[c]
    const sectionId = await db.sections.add({
      projectId,
      branchId,
      volumeId,
      title: chapter.title,
      summary: chapter.summary,
      order: c,
      status: 'drafting',
      content: '',
      wordCount: 0,
      tags: [],
      createdAt: now,
      updatedAt: now
    })
    for (let s = 0; s < chapter.scenes.length; s++) {
      const scene = chapter.scenes[s]
      const content = html(scene.paragraphs)
      sceneNumber += 1
      await db.subsections.add({
        projectId,
        branchId,
        sectionId,
        title: scene.title,
        summary: scene.paragraphs[0].slice(0, 120),
        order: s,
        sceneNumber,
        contentStatus: 'draft',
        content,
        wordCount: countWords(scene.paragraphs.join(' ')),
        charactersPresent: scene.characters,
        location: scene.location,
        tags: [],
        createdAt: now,
        updatedAt: now
      })
    }
  }

  return { projectId, created: true }
}
