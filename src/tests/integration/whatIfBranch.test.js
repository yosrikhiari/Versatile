import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * WHATIF-AND-IMPORT-PLAN.md step 4, gates G6 (the fork is exact) and G8
 * (merge updates the source scenes it came from, snapshot first), over the
 * real schema. The model, the writer and the critic are stand-ins.
 */

// A stand-in model that answers the planner's three questions by what they
// ask: the change, one scene's fate (reason first), or a scene's new brief.
function defaultModel(prompt) {
  if (prompt.includes('"divergenceFact"')) {
    return {
      divergenceFact: 'Zeena stayed home.',
      divergenceBrief: 'Zeena decides not to go to Bettsbridge.'
    }
  }
  if (prompt.includes('"needs"')) {
    return prompt.includes('great elm')
      ? { needs: 'Zeena away', conflict: 'the sled ride needs Zeena away', action: 'drop' }
      : { needs: 'the village gathers', conflict: 'none', action: 'keep' }
  }
  if (prompt.includes('"assumesAway"')) {
    // The who-is-where question.
    if (prompt.includes('After Zeena left, the house was quiet.')) {
      return {
        present: 'no',
        where: '',
        shownMove: '',
        // wrapped in quotation marks, as the live model does
        assumesAway: '"After Zeena left, the house was quiet."'
      }
    }
    if (prompt.includes('Zeena stays by the stove.')) {
      return { present: 'yes', where: 'at home by the stove', shownMove: '', assumesAway: '' }
    }
    return { present: 'unclear', where: '', shownMove: '', assumesAway: '' }
  }
  if (prompt.includes('Record, from this passage only')) {
    // The scene reader, on a rewritten scene.
    return {
      summary: 'Zeena stays by the stove.',
      keyFacts: ['Zeena is at home all evening.'],
      characters: [{ name: 'Zeena' }],
      places: [],
      relationships: []
    }
  }
  return { brief: 'A new brief.' }
}
const aiGenerateJson = vi.fn()
vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: (...a) => aiGenerateJson(...a)
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
      // __writerText: one text for every scene, or a function of the row
      // (so a test can give one scene its own text and not trip §46).
      const text = globalThis.__writerText
      for (const s of blank.filter((x) => x.contentStatus === 'pending')) {
        await db.subsections.update(s.id, {
          content:
            (typeof text === 'function' ? text(s) : text) || '<p>Zeena stays by the stove.</p>',
          contentStatus: 'generated'
        })
      }
      return { written: 1 }
    }
  })
}))

// The critic: the kept "Church" scene contradicts the change; its repair is a new sentence.
const criticCalls = []
vi.mock('@/composables/useStoryCritic', () => ({
  useStoryCritic: () => ({
    async checkContradictions({ sceneProse, ledger }) {
      criticCalls.push({ prose: sceneProse[0].prose, ledger })
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
  criticCalls.length = 0
  aiGenerateJson.mockReset().mockImplementation(async (p) => defaultModel(p))
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

/** Writer text for scene 3 only; every other scene gets the default. */
const only3 = (text) => (row) => (row.sceneNumber === 3 ? text : null)

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

    // plan: the change, then one reason-first question per later scene
    const plan = await w.plan(projectId, branch.id)
    expect(plan.divergenceFact).toBe('Zeena stayed home.')
    expect(plan.scenes.map((s) => [s.sceneNumber, s.action])).toEqual([
      [2, 'revise'],
      [3, 'keep'],
      [4, 'drop']
    ])
    expect(plan.scenes[2].reason).toBe('the sled ride needs Zeena away')
    const prompts = aiGenerateJson.mock.calls.map((c) => c[0])
    expect(prompts[0]).toContain('WHAT IF: What if Zeena stayed home?')
    expect(prompts.filter((p) => p.includes('"needs"'))).toHaveLength(2)

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
    // Every scene after the change is checked, the rewritten one included,
    // and a later scene is checked against what the rewritten one established.
    expect(criticCalls.map((c) => c.prose)).toEqual([
      'Zeena stays by the stove.',
      expect.stringContaining('The village gathers.')
    ])
    expect(criticCalls[0].ledger).toEqual(['Zeena stayed home.'])
    expect(criticCalls[1].ledger).toEqual(['Zeena stayed home.', 'Zeena is at home all evening.'])
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

  it('an unreadable answer keeps the book as written and rewrites only the scene of the change', async () => {
    const { projectId, main, bySceneNo } = await book()
    aiGenerateJson.mockResolvedValue('not json at all')
    const { useWhatIfBranch } = await import('@/composables/useWhatIfBranch')
    const w = useWhatIfBranch()
    const branch = await w.fork(projectId, main, bySceneNo[3].id, 'What if the church burned?')
    const plan = await w.plan(projectId, branch.id)
    expect(plan.scenes.map((s) => s.action)).toEqual(['revise', 'keep'])
    // The premise itself, as a statement.
    expect(plan.divergenceFact).toBe('The church burned.')
  })

  it('each changed scene gets its own brief, from its own original and the change', async () => {
    const { projectId, main, bySceneNo } = await book()
    aiGenerateJson.mockImplementation(async (p) =>
      p.includes('"needs"')
        ? { needs: 'x', conflict: 'Zeena would be there', action: 'revise' }
        : defaultModel(p)
    )
    const { useWhatIfBranch } = await import('@/composables/useWhatIfBranch')
    const w = useWhatIfBranch()
    const branch = await w.fork(projectId, main, bySceneNo[2].id, 'What if Zeena stayed home?')
    const plan = await w.plan(projectId, branch.id)
    expect(plan.scenes.map((s) => s.action)).toEqual(['revise', 'revise', 'revise'])
    expect(plan.scenes[1].reason).toBe('Zeena would be there')
    const briefPrompts = aiGenerateJson.mock.calls
      .map((c) => c[0])
      .filter((p) => p.includes('"brief"'))
    expect(briefPrompts).toHaveLength(2)
    // Each brief question is about its own scene, and never sees another
    // scene's new brief (that made every brief a copy of the first, live).
    expect(briefPrompts[0]).toContain('The village gathers without Zeena.')
    expect(briefPrompts[1]).toContain('Ethan and Mattie sled into the great elm.')
    expect(briefPrompts.every((p) => p.includes('Zeena stayed home.'))).toBe(true)
    expect(briefPrompts.some((p) => p.includes('A new brief.'))).toBe(false)
    expect(briefPrompts.some((p) => p.includes('Zeena decides not to go to Bettsbridge.'))).toBe(
      false
    )
  })

  it('the planner decides each scene on its own sentences about the people the change names (§43)', async () => {
    const { projectId, main, bySceneNo } = await book()
    const { useStoryBibleStore } = await import('@/stores/storyBibleStore')
    useStoryBibleStore().characters.push({ id: 1, name: 'Zeena Frome', aliases: ['Zeena'] })
    const { useWhatIfBranch } = await import('@/composables/useWhatIfBranch')
    const w = useWhatIfBranch()
    const branch = await w.fork(projectId, main, bySceneNo[2].id, 'What if Zeena stayed home?')
    await w.plan(projectId, branch.id)
    const fates = aiGenerateJson.mock.calls
      .map((c) => String(c[0]))
      .filter((p) => p.includes('"needs"'))
    // "The village gathers without Zeena." is the summary; the scene's own
    // text is the evidence the planner is shown.
    // The first question is the summary alone; the kept church scene then
    // gets a second look with its own sentences about her.
    const church = fates.filter((p) => p.includes('The village gathers without Zeena.'))
    expect(church).toHaveLength(2)
    expect(church[0]).not.toContain('quoted')
    expect(church[1]).toContain('- "Zeena was away."')
    // A scene that never names her gets no quotes.
    expect(fates.find((p) => p.includes('great elm'))).not.toContain('quoted')
  })

  it('a rewrite keeps its original narrative person, or is flagged and rewritten with the rule (§44)', async () => {
    const { projectId, main, bySceneNo } = await book()
    const pad = Array.from({ length: 160 }, () => 'the').join(' ')
    const firstPerson = `<p>I walked to the church and I waited by the door. ${pad} My hands were cold.</p>`
    const thirdPerson = `<p>He walked to the church and he waited by the door. ${pad} His hands were cold.</p>`
    await db.subsections.update(bySceneNo[3].id, { content: firstPerson })
    const { useWhatIfBranch } = await import('@/composables/useWhatIfBranch')
    const w = useWhatIfBranch()
    const branch = await w.fork(projectId, main, bySceneNo[2].id, 'What if Zeena stayed home?')
    const plan = await w.plan(projectId, branch.id)
    const church = plan.scenes.find((s) => s.sceneNumber === 3)
    church.action = 'revise'
    church.brief = 'The village gathers.'
    await w.savePlan(branch.id, plan)
    globalThis.__writerText = only3(thirdPerson)
    try {
      const written = await w.write(projectId, branch.id)
      const scene = written.scenes.find((s) => s.sceneNumber === 3)
      // the writer was told which person to keep
      const row = await db.subsections.get(scene.subsectionId)
      expect(row.description).toContain('NARRATION: first person')
      // it did not keep it: flagged, not edited
      expect(scene.povDrift).toMatchObject({ from: 'first', to: 'third' })
      expect(scene.outcome).toBe('written, needs review')
      expect(row.contentStatus).toBe('review')
      // Rewrite this scene carries the rule; a first-person rewrite clears it
      globalThis.__writerText = only3(firstPerson)
      const again = await w.rewriteScene(projectId, branch.id, scene.subsectionId)
      const fixed = again.scenes.find((s) => s.sceneNumber === 3)
      expect((await db.subsections.get(scene.subsectionId)).description).toContain(
        '- NARRATION: first person'
      )
      expect(fixed.povDrift).toBeUndefined()
      expect(fixed.outcome).toBe('written')
    } finally {
      delete globalThis.__writerText
    }
  })

  it('a rewrite keeps its original tense, or is flagged and rewritten with the rule (§45)', async () => {
    const { projectId, main, bySceneNo } = await book()
    const para = (p) => Array.from({ length: 4 }, () => `<p>${p}</p>`).join('')
    const past = para(
      'He walked to the church and waited by the door. The yard was empty; he stood there.'
    )
    const present = para(
      'He walks to the church and waits by the door. The yard is empty; he stands there.'
    )
    await db.subsections.update(bySceneNo[3].id, { content: past })
    const { useWhatIfBranch } = await import('@/composables/useWhatIfBranch')
    const w = useWhatIfBranch()
    const branch = await w.fork(projectId, main, bySceneNo[2].id, 'What if Zeena stayed home?')
    const plan = await w.plan(projectId, branch.id)
    const church = plan.scenes.find((s) => s.sceneNumber === 3)
    church.action = 'revise'
    church.brief = 'The village gathers.'
    await w.savePlan(branch.id, plan)
    globalThis.__writerText = only3(present)
    try {
      const written = await w.write(projectId, branch.id)
      const scene = written.scenes.find((s) => s.sceneNumber === 3)
      // the writer was told which tense to keep
      const row = await db.subsections.get(scene.subsectionId)
      expect(row.description).toContain('TENSE: past tense')
      // it did not keep it: flagged, not edited
      expect(scene.tenseDrift).toMatchObject({ from: 'past', to: 'present' })
      expect(scene.outcome).toBe('written, needs review')
      expect(row.contentStatus).toBe('review')
      // Rewrite this scene carries the rule; a past-tense rewrite that
      // slides into the present for two paragraphs is still flagged
      const slid =
        para(
          'He walked to the church and waited by the door. The yard was empty; he stood there.'
        ) +
        '<p>He walks to the church and waits by the door. The yard is empty; he stands there.</p>'.repeat(
          2
        ) +
        para('He walked to the church and waited by the door. The yard was empty; he stood there.')
      globalThis.__writerText = only3(slid)
      const again = await w.rewriteScene(projectId, branch.id, scene.subsectionId)
      const partly = again.scenes.find((s) => s.sceneNumber === 3)
      expect((await db.subsections.get(scene.subsectionId)).description).toContain(
        '- TENSE: past tense'
      )
      expect(partly.tenseDrift).toBeUndefined()
      expect(partly.tenseSlip).toMatchObject({ added: 2 })
      expect(partly.outcome).toBe('written, needs review')
      // and a past-tense rewrite clears it
      globalThis.__writerText = only3(past)
      const fixed = (await w.rewriteScene(projectId, branch.id, scene.subsectionId)).scenes.find(
        (s) => s.sceneNumber === 3
      )
      expect(fixed.tenseSlip).toBeUndefined()
      expect(fixed.outcome).toBe('written')
    } finally {
      delete globalThis.__writerText
    }
  })

  it('a written scene that repeats a passage of another scene is flagged, and rewritten without it (§46)', async () => {
    const { projectId, main, bySceneNo } = await book()
    const { useWhatIfBranch } = await import('@/composables/useWhatIfBranch')
    const w = useWhatIfBranch()
    const branch = await w.fork(projectId, main, bySceneNo[2].id, 'What if Zeena stayed home?')
    const plan = await w.plan(projectId, branch.id)
    for (const n of [3, 4]) {
      const s = plan.scenes.find((x) => x.sceneNumber === n)
      s.action = 'revise'
      s.brief = n === 3 ? 'The village gathers.' : 'They ride down the hill.'
    }
    await w.savePlan(branch.id, plan)
    // the writer copies the same passage into both chapters (3 and 4)
    const passage =
      '<p>The air was thick with the scent of damp earth and crushed grass, and Ethan moved through the snow with the weight of his own silence pressing against him like a hand on his chest.</p>'
    globalThis.__writerText = (row) => (row.sceneNumber >= 3 ? passage : null)
    try {
      const written = await w.write(projectId, branch.id)
      const church = written.scenes.find((s) => s.sceneNumber === 3)
      const sled = written.scenes.find((s) => s.sceneNumber === 4)
      // the later of the two carries the flag; the earlier is left alone
      expect(church.repeats).toBeUndefined()
      expect(sled.repeats).toHaveLength(1)
      expect(sled.repeats[0]).toMatchObject({ with: 'Two', subsectionId: church.subsectionId })
      expect(sled.repeats[0].run).toBeGreaterThanOrEqual(25)
      expect(sled.outcome).toBe('written, needs review')
      // Rewrite this scene says what not to repeat; new words clear it
      globalThis.__writerText =
        '<p>They took the sled to the top of School House Hill, and Mattie laughed when the runners caught.</p>'
      const again = await w.rewriteScene(projectId, branch.id, sled.subsectionId)
      const brief = (await db.subsections.get(sled.subsectionId)).description
      expect(brief).toContain('- NEW WORDS:')
      expect(brief).toContain('"Two"')
      const fixed = again.scenes.find((s) => s.sceneNumber === 4)
      expect(fixed.repeats).toBeUndefined()
    } finally {
      delete globalThis.__writerText
    }
  })

  it('a branch switch does not leave the old branch scene open in the editor (§42)', async () => {
    const { projectId, main, bySceneNo } = await book()
    const { useWhatIfBranch } = await import('@/composables/useWhatIfBranch')
    const branch = await useWhatIfBranch().fork(projectId, main, bySceneNo[2].id, 'What if?')
    const { useManuscriptStore } = await import('@/stores/manuscriptStore')
    const { useBranchStore } = await import('@/stores/branchStore')
    const ms = useManuscriptStore()
    await useBranchStore().switchTo(projectId, main)
    ms.activeSubsectionId = bySceneNo[1].id
    await useBranchStore().switchTo(projectId, branch.id)
    // The main-branch scene is not in the branch's rows: it must not stay
    // "open", or the editor loads '' and autosaves it over the original.
    expect(ms.subsections.some((s) => s.id === bySceneNo[1].id)).toBe(false)
    expect(ms.activeSubsectionId).not.toBe(bySceneNo[1].id)
  })

  it('who is where: a person shown at home and later treated as gone, never shown leaving, is flagged for review', async () => {
    const { projectId, main, bySceneNo } = await book()
    // The fact check misses this sentence (as it did on the live branch):
    // nothing it is given says Zeena is still at home.
    await db.subsections.update(bySceneNo[3].id, {
      content: '<p>Church. The village gathers. After Zeena left, the house was quiet.</p>'
    })
    const { useStoryBibleStore } = await import('@/stores/storyBibleStore')
    const bible = useStoryBibleStore()
    bible.characters.push({ id: 1, name: 'Zeena Frome', aliases: ['Zeena'] })
    const { useWhatIfBranch } = await import('@/composables/useWhatIfBranch')
    const w = useWhatIfBranch()
    const branch = await w.fork(projectId, main, bySceneNo[2].id, 'What if Zeena stayed home?')
    await w.plan(projectId, branch.id)
    const written = await w.write(projectId, branch.id)
    const kept = written.scenes.find((s) => s.sceneNumber === 3)
    expect(kept.presenceIssues).toEqual([
      {
        who: 'Zeena Frome',
        sentence: 'After Zeena left, the house was quiet.',
        fact: expect.stringContaining('still at home by the stove')
      }
    ])
    // flagged for the author, not rewritten (a sentence patch kept the
    // absence live, and on a false alarm changed the original epilogue)
    expect(kept.outcome).toBe('needs review')
    const row = await db.subsections.get(kept.subsectionId)
    expect(row.content).toContain('After Zeena left')
    expect(row.contentStatus).toBe('review')

    // Check again starts a fresh list: it does not pile onto the last run's.
    const again = await w.recheck(projectId, branch.id)
    expect(again.scenes.find((s) => s.sceneNumber === 3).presenceIssues).toHaveLength(1)

    // Rewrite this scene (§40): written again with the missing event as a
    // rule, then only that scene is checked again.
    const asked = () =>
      aiGenerateJson.mock.calls.filter((c) => String(c[0]).includes('"assumesAway"')).length
    const [askedBefore, criticBefore] = [asked(), criticCalls.length]
    const rewritten = await w.rewriteScene(projectId, branch.id, kept.subsectionId)
    const scene = rewritten.scenes.find((s) => s.sceneNumber === 3)
    const now = await db.subsections.get(kept.subsectionId)
    expect(now.description).toContain('MUST HOLD')
    expect(now.description).toContain('Zeena Frome is still at home by the stove')
    expect(now.content).toBe('<p>Zeena stays by the stove.</p>')
    expect(scene.presenceIssues).toBeUndefined()
    expect(scene.outcome).toBe('written')
    expect(scene.previousContent).toContain('After Zeena left')
    // one presence question and one fact check, for that scene alone
    expect(asked() - askedBefore).toBe(1)
    expect(criticCalls.length - criticBefore).toBe(1)

    await w.undoRewrite(branch.id, kept.subsectionId)
    expect((await db.subsections.get(kept.subsectionId)).content).toContain('After Zeena left')

    // A rewrite that keeps her present but still says she is gone breaks its
    // own MUST HOLD rule; the who-is-where question lets that through (she
    // is "present"), so code checks the rule itself (§41, live T3 VIII).
    await w.recheck(projectId, branch.id)
    globalThis.__writerText =
      "<p>Zeena stays by the stove. He thought of Zeena's absence all the same.</p>"
    try {
      const again = await w.rewriteScene(projectId, branch.id, kept.subsectionId)
      const s3 = again.scenes.find((s) => s.sceneNumber === 3)
      expect(s3.outcome).toBe('written, needs review')
      expect(s3.presenceIssues).toEqual([
        {
          who: 'Zeena Frome',
          sentence: "He thought of Zeena's absence all the same.",
          fact: expect.stringContaining('never left')
        }
      ])
      expect((await db.subsections.get(kept.subsectionId)).contentStatus).toBe('review')
    } finally {
      delete globalThis.__writerText
    }
  })
})
