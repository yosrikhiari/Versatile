import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * WHATIF-AND-IMPORT-PLAN.md step 4, gates G6 (the fork is exact) and G8
 * (merge updates the source scenes it came from, snapshot first), over the
 * real schema. The model's plan, the writer and the critic are stand-ins.
 */

const aiGenerateJson = vi.fn(async () => ({
  divergenceFact: 'Zeena stayed home.',
  divergenceBrief: 'Zeena decides not to go to Bettsbridge.',
  scenes: [
    { sceneNumber: 3, action: 'keep', reason: 'unaffected' },
    { sceneNumber: 4, action: 'drop', reason: 'cannot happen now' }
  ]
}))
vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: (...a) => aiGenerateJson(...a),
  aiChoiceProbabilities: vi.fn(async () => null)
}))

// The writer: fills every blank scene of the active branch, and records what it was told.
const writerCalls = []
vi.mock('@/composables/useVolumeStoryGenerator', () => ({
  useVolumeStoryGenerator: () => ({
    progress: { statusText: '' },
    async writeWhatIf(args) {
      writerCalls.push(args)
      const { db } = await import('@/services/db-core')
      const { useBranchStore } = await import('@/stores/branchStore')
      const branchId = useBranchStore().activeBranchId
      const blank = await db.subsections.where({ projectId: args.projectId, branchId }).toArray()
      for (const s of blank.filter((x) => x.contentStatus === 'pending')) {
        await db.subsections.update(s.id, {
          content: '<p>Zeena stays by the stove.</p>',
          contentStatus: 'generated'
        })
      }
      return { written: 1 }
    }
  })
}))

// The critic: the kept "Church" scene contradicts the change; its repair is a new sentence.
vi.mock('@/composables/useStoryCritic', () => ({
  useStoryCritic: () => ({
    async checkContradictions({ sceneProse, ledger }) {
      const prose = sceneProse[0].prose
      return prose.includes('Zeena was away.')
        ? {
            characterIssues: [
              { character: 'Zeena', contradictions: [{ between: ['Zeena was away.', ledger[0]] }] }
            ]
          }
        : { characterIssues: [] }
    },
    repairSentence: async () => 'Zeena watched from the pew.'
  })
}))

let db

beforeEach(async () => {
  setActivePinia(createPinia())
  writerCalls.length = 0
  db = (await import('@/services/db-core')).db
  for (const t of [
    'projects',
    'manuscripts',
    'sections',
    'subsections',
    'branches',
    'volumes',
    'sceneDigests',
    'entityStates',
    'chapterDigests',
    'snapshots'
  ]) {
    await db[t].clear()
  }
})

async function book() {
  const { decodeFile } = await import('@/services/import/decoders')
  const { detectStructure } = await import('@/services/import/structure')
  const { createProjectFromBook } = await import('@/services/import/writeProject')
  const md = [
    '## One',
    'Arrival. Ethan meets Mattie.',
    '***',
    'Letter. Zeena went to Bettsbridge.',
    '## Two',
    'Church. The village gathers. Zeena was away.',
    '## Three',
    'Sled. They ride down School House Hill.'
  ].join('\n\n')
  const d = await decodeFile('ef.md', new TextEncoder().encode(md).buffer)
  const { projectId } = await createProjectFromBook(detectStructure(d.blocks), { name: 'EF' })
  const { useBranchStore } = await import('@/stores/branchStore')
  const main = await useBranchStore().initForProject(projectId)
  // As a read book has them (step 3): the canon and the plan are built from these.
  const SUMMARIES = {
    1: 'Ethan meets Mattie at the church door.',
    2: 'Zeena leaves for Bettsbridge.',
    3: 'The village gathers without Zeena.',
    4: 'Ethan and Mattie sled into the great elm.'
  }
  for (const s of await db.subsections.where({ projectId, branchId: main }).toArray()) {
    await db.subsections.update(s.id, { summary: SUMMARIES[s.sceneNumber] })
  }
  const subs = await db.subsections.where({ projectId, branchId: main }).toArray()
  const bySceneNo = Object.fromEntries(subs.map((s) => [s.sceneNumber, s]))
  return { projectId, main, bySceneNo }
}

describe('What If as a branch', () => {
  it('forks exactly, plans every later scene, writes, checks kept scenes, and merges with snapshots', async () => {
    const { projectId, main, bySceneNo } = await book()
    const { useWhatIfBranch } = await import('@/composables/useWhatIfBranch')
    const w = useWhatIfBranch()

    // fork at scene 2
    const branch = await w.fork(projectId, main, bySceneNo[2].id, 'What if Zeena stayed home?')
    const copies = await db.subsections.where({ projectId, branchId: branch.id }).toArray()
    const copyOf = Object.fromEntries(copies.map((c) => [c.sourceSubsectionId, c]))
    // G6: before the change, byte for byte; every copy knows its source.
    expect(copyOf[bySceneNo[1].id].content).toBe(bySceneNo[1].content)
    expect(copies.every((c) => c.sourceSubsectionId != null)).toBe(true)
    expect(branch.whatIf.divergenceId).toBe(copyOf[bySceneNo[2].id].id)

    // plan
    const plan = await w.plan(projectId, branch.id)
    expect(plan.scenes.map((s) => [s.sceneNumber, s.action])).toEqual([
      [2, 'revise'],
      [3, 'keep'],
      [4, 'drop']
    ])
    const planPrompt = aiGenerateJson.mock.calls[0][0]
    expect(planPrompt).toContain('WHAT IF: What if Zeena stayed home?')
    // The planner does see what follows: it must decide about it.
    expect(planPrompt).toContain('Ethan and Mattie sled into the great elm.')

    // write
    const written = await w.write(projectId, branch.id)
    expect(written.scenes.map((s) => [s.sceneNumber, s.outcome])).toEqual([
      [2, 'written'],
      [3, 'repaired'],
      [4, 'dropped']
    ])
    // The writer's canon is the story up to the change, and the change -- never the future.
    expect(writerCalls[0].canon).toContain('Zeena stayed home.')
    expect(writerCalls[0].canon).toContain('Ethan meets Mattie at the church door.')
    expect(writerCalls[0].canon).not.toContain('elm')
    expect(writerCalls[0].canon).not.toContain('Zeena leaves for Bettsbridge')
    const after = await db.subsections.where({ projectId, branchId: branch.id }).toArray()
    expect(after).toHaveLength(3)
    const church = after.find((s) => s.sourceSubsectionId === bySceneNo[3].id)
    expect(church.content).toContain('Zeena watched from the pew.')
    expect(church.content).not.toContain('Zeena was away.')
    // The source book is untouched until a merge.
    expect((await db.subsections.get(bySceneNo[2].id)).content).toBe(bySceneNo[2].content)

    // compare + merge
    const rows = await w.compare(projectId, branch.id)
    expect(rows.map((r) => [r.sceneNumber, r.action])).toEqual([
      [2, 'revise'],
      [3, 'keep'],
      [4, 'drop']
    ])
    const merged = await w.merge(projectId, branch.id, [bySceneNo[2].id, bySceneNo[3].id])
    expect(merged).toBe(2)
    expect((await db.subsections.get(bySceneNo[2].id)).content).toBe(
      '<p>Zeena stays by the stove.</p>'
    )
    expect((await db.subsections.get(bySceneNo[3].id)).content).toContain(
      'Zeena watched from the pew.'
    )
    // Not chosen: the dropped scene is still in the book.
    expect(await db.subsections.get(bySceneNo[4].id)).toBeTruthy()
    // G8: every merged scene was snapshotted first, restorable by its id.
    const snaps = await db.snapshots.where('projectId').equals(projectId).toArray()
    expect(snaps.map((s) => s.chapterId).sort()).toEqual([bySceneNo[2].id, bySceneNo[3].id].sort())
    expect(snaps.every((s) => s.label.startsWith('Before What If:'))).toBe(true)
    expect(snaps.find((s) => s.chapterId === bySceneNo[2].id).content).toBe(bySceneNo[2].content)
    expect((await db.branches.get(branch.id)).whatIf.status).toBe('merged')
  })

  it('an unreadable plan still keeps the book and rewrites only the scene of the change', async () => {
    const { projectId, main, bySceneNo } = await book()
    aiGenerateJson.mockResolvedValueOnce('not json at all')
    const { useWhatIfBranch } = await import('@/composables/useWhatIfBranch')
    const w = useWhatIfBranch()
    const branch = await w.fork(projectId, main, bySceneNo[3].id, 'What if the church burned?')
    const plan = await w.plan(projectId, branch.id)
    expect(plan.scenes.map((s) => s.action)).toEqual(['revise', 'keep'])
  })
})
