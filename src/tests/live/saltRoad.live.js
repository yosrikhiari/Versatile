/**
 * Live run: a 10-chapter book through the real pipeline against local Ollama,
 * headless. Not a test of the code — a way to run the generator without a
 * browser tab, so a Vite reload cannot kill a two-hour run.
 *
 *   npx vitest run --config vitest.live.config.js
 *
 * Progress streams to `reports/live/<slug>/progress.log`; the finished book
 * (and the plan, health records and per-scene metadata) land beside it.
 *
 * Env: LIVE_TITLE, LIVE_CHAPTERS, LIVE_SCENES, LIVE_WORDS, OLLAMA_HOST, LIVE_MODEL,
 *      LIVE_ORCHESTRATOR (legacy | langgraph), LIVE_MODE (workflow | agentic),
 *      LIVE_PRESET (multi-agent → Critic and Editor on qwen2.5:3b-instruct, CPU)
 *      LIVE_TRACE=agentops (route every model call through the AgentOps gateway at
 *      LIVE_AGENTOPS_URL, default http://localhost:8080; trace ids land in health.json)
 *      LIVE_FOCUSED=1 (the focused, input-isolated critic instead of the combined
 *      one; wire.json then splits writer calls from judge calls, §21)
 * (prose model; unset keeps the app default — the utility model is always qwen3:8b).
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mkdirSync, writeFileSync, appendFileSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const TITLE = process.env.LIVE_TITLE || 'The Salt Road'
const CHAPTERS = Number(process.env.LIVE_CHAPTERS || 10)
const SCENES = Number(process.env.LIVE_SCENES || 3)
const WORDS = Number(process.env.LIVE_WORDS || 2400)
const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'

const GENRE = 'Literary historical fiction'
const TONE = 'restrained, precise, quietly tense'
const SYNOPSIS =
  'Ottoman Anatolia, 1868. Nesrin, a widowed salt-carrier, inherits her husband’s debt to the ' +
  'caravan master Halim and his route along the Salt Road from the Tuz lake to the coast. To ' +
  'keep her son and her mules, she must complete one full season of hauling salt through a ' +
  'province where the tax-farmers are tightening, the old road is being bypassed by the new ' +
  'railway survey, and a rumour spreads that the salt itself is being cut with something that ' +
  'kills. Over ten chapters she learns the road, its people and its quiet crimes — and has to ' +
  'decide whether to expose what she finds when the man cutting the salt is the only one who ' +
  'can cancel her debt.'

const slug = TITLE.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '')
const OUT = join(process.cwd(), 'reports', 'live', slug)
mkdirSync(OUT, { recursive: true })
const LOG = join(OUT, 'progress.log')
writeFileSync(LOG, '')

const t0 = Date.now()
function log(line) {
  const stamp = ((Date.now() - t0) / 60000).toFixed(1).padStart(6)
  appendFileSync(LOG, `[${stamp}m] ${line}\n`)
}

function words(text) {
  const t = (text || '').trim()
  return t ? t.split(/\s+/).length : 0
}

/**
 * Every prompt this run sends to Ollama, so a run can answer "what did the
 * model actually see?".
 *
 * A run used to be able to say only what came out. That is how
 * `draft.slice(0, 4000)` in the critic survived three live runs: the prose was
 * fine, the verdicts looked plausible, and nothing recorded that the judge had
 * been handed 74% of a scene. AgentOps cannot fill this in -- PRIVACY.md has it
 * strip prompts from every read path on purpose -- so the capture lives here,
 * local to the run, and is written next to the book.
 */
const wireCalls = []

/**
 * Judge or writer, from what the call asks for. The gate on/off comparison
 * (§21) is a question about how many extra calls the gate costs a run, and
 * the wire is the only place every call passes through.
 */
function callKind(body) {
  const text = `${body.system || ''}
${body.prompt || JSON.stringify(body.messages || '')}`
  if (
    /story critic|story editor judging|Judge ONE aspect|label paragraphs of fiction|check new prose against established facts|judge dialogue voice|dimensionScores/i.test(
      text
    )
  )
    return 'judge'
  if (body.format) return 'structured'
  return 'prose'
}

function captureOllamaCalls() {
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    if (init?.body && /\/api\/(generate|chat)/.test(url)) {
      try {
        const body = JSON.parse(init.body)
        wireCalls.push({
          at: Date.now(),
          model: body.model,
          numCtx: body.options?.num_ctx ?? null,
          promptChars: (body.prompt || JSON.stringify(body.messages || '')).length,
          prompt: body.prompt || JSON.stringify(body.messages || ''),
          kind: callKind(body)
        })
      } catch {
        /* an unparsable body is not worth failing a two-hour run over */
      }
    }
    return realFetch(input, init)
  }
}

describe('live: The Salt Road', () => {
  it('writes the book', async () => {
    captureOllamaCalls()
    setActivePinia(createPinia())
    localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, HOST)
    localStorage.setItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL, 'qwen3:8b')
    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({
        ollamaEndpoint: HOST,
        ...(process.env.LIVE_MODEL ? { ollamaModel: process.env.LIVE_MODEL } : {}),
        ...(process.env.LIVE_ORCHESTRATOR ? { orchestrator: process.env.LIVE_ORCHESTRATOR } : {}),
        ...(process.env.LIVE_MODE ? { orchestratorMode: process.env.LIVE_MODE } : {}),
        embeddingProvider: 'ollama',
        embeddingModel: 'snowflake-arctic-embed2'
      })
    )
    if (process.env.LIVE_PRESET === 'multi-agent') {
      const { applyRolePreset, MULTI_AGENT_PRESET } = await import('@/config/roles')
      applyRolePreset(MULTI_AGENT_PRESET)
    }
    if (process.env.LIVE_TRACE === 'agentops') {
      const { setAgentOpsTracing, setAgentOpsUrl } = await import('@/config/agentops')
      setAgentOpsTracing(true)
      if (process.env.LIVE_AGENTOPS_URL) setAgentOpsUrl(process.env.LIVE_AGENTOPS_URL)
    }
    if (process.env.LIVE_FOCUSED === '1') {
      const { setFocusedCritic } = await import('@/composables/useStoryCritic')
      setFocusedCritic(true)
    }
    const { recentTraces } = await import('@/services/traceContext')
    const { useOrchestrationStore } = await import('@/stores/orchestrationStore')

    const { db } = await import('@/services/db-core')
    await db.delete()
    await db.open()
    const { createProject } = await import('@/services/db-projects')
    const { useProjectStore } = await import('@/stores/projectStore')
    const { useVolumeStoryGenerator } = await import('@/composables/useVolumeStoryGenerator')

    const projectId = await createProject(TITLE, GENRE, SYNOPSIS, 1)
    await useProjectStore().loadProject(projectId)

    const gen = useVolumeStoryGenerator()
    let lastPhase = ''
    let lastStatus = ''
    const tick = setInterval(() => {
      const p = gen.phase.value
      const s = gen.progress.statusText || ''
      if (p !== lastPhase || s !== lastStatus) {
        log(
          `phase=${p} ${gen.progress.current}/${gen.progress.total} ${gen.progress.sceneLabel || ''} — ${s}`
        )
        lastPhase = p
        lastStatus = s
      }
    }, 5000)

    const seenSlots = new Set()
    let planDumped = false
    const scenesTick = setInterval(() => {
      // The outline is worth reading long before the prose is finished.
      if (!planDumped && gen.scenePlan.value.length) {
        writeFileSync(
          join(OUT, 'plan.json'),
          JSON.stringify(
            {
              chapterPlan: gen.chapterPlan?.value ?? [],
              spine: gen.spineArray?.value ?? [],
              scenePlan: gen.scenePlan.value
            },
            null,
            2
          )
        )
        planDumped = true
        log(
          `plan dumped: ${gen.chapterPlan?.value?.length ?? 0} chapters, ${gen.scenePlan.value.length} scenes`
        )
      }
      // `writtenScenes` is a fixed-length slot array filled out of order (the
      // parallel writer lands every chapter's anchors first, then the middles),
      // so "the last non-empty slot" is not "the scene that just landed" — for
      // the whole second phase it was the book's final scene, reported over and
      // over. Report the slots that are newly filled since the last tick.
      const filled = gen.writtenScenes.value.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)
      const fresh = filled.filter((i) => !seenSlots.has(i))
      if (fresh.length) {
        for (const i of fresh) {
          const s = gen.writtenScenes.value[i]
          seenSlots.add(i)
          log(
            `scene ${seenSlots.size}/${gen.scenePlan.value.length} written: #${i + 1} "${s?.title}" ${words(s?.prose)}w`
          )
        }
      }
    }, 5000)

    log(
      `start ${TITLE}: ${CHAPTERS} chapters × ${SCENES} scenes × ${WORDS} words @ ${HOST} ` +
        `orchestrator=${process.env.LIVE_ORCHESTRATOR || 'legacy'} mode=${process.env.LIVE_MODE || 'workflow'} preset=${process.env.LIVE_PRESET || 'none'} trace=${process.env.LIVE_TRACE || 'off'}`
    )
    try {
      await gen.startGeneration({
        projectId,
        synopsis: SYNOPSIS,
        genre: GENRE,
        tone: TONE,
        auto: true,
        structure: {
          volumes: 1,
          chaptersPerVolume: CHAPTERS,
          scenesPerChapter: SCENES,
          wordsPerChapter: WORDS
        },
        research: null,
        onChunk: () => {}
      })
      if (gen.phase.value === 'plan-preview') {
        log('plan-preview reached in auto mode; confirming')
        await gen.confirmPlan({ projectId, onChunk: () => {} })
      }
    } catch (e) {
      log(`FAILED: ${e?.stack || e}`)
      throw e
    } finally {
      clearInterval(tick)
      clearInterval(scenesTick)
    }

    // ── Dump everything the run produced ─────────────────────────────────
    writeFileSync(
      join(OUT, 'plan.json'),
      JSON.stringify(
        {
          chapterPlan: gen.chapterPlan?.value ?? [],
          spine: gen.spineArray?.value ?? [],
          scenePlan: gen.scenePlan.value
        },
        null,
        2
      )
    )
    writeFileSync(
      join(OUT, 'health.json'),
      JSON.stringify(
        {
          phase: gen.phase.value,
          error: gen.error.value,
          // Every gateway trace this process reported (AgentOps tracing on),
          // and what the Agents panel saw of the graph run.
          traces: recentTraces().map((t) => ({
            traceId: t.traceId,
            agentRole: t.agentRole,
            clientRef: t.clientRef,
            model: t.model,
            at: t.at
          })),
          orchestration: {
            decisions: useOrchestrationStore().run.decisions,
            tracesSeenByPanel: useOrchestrationStore().run.traces.length
          },
          violations: gen.runHealthViolations.value,
          failedScenes: gen.runFailedScenes.value,
          bibleChangesCommitted: gen.bibleChangesDiscovered.value,
          scenesSynced: gen.scenesSynced.value,
          bible: {
            characters: (await db.characters.where('projectId').equals(projectId).toArray()).map(
              (c) => ({ name: c.name, status: c.generationStatus, chapterId: c.chapterId ?? null })
            ),
            locations: (await db.locations.where('projectId').equals(projectId).toArray()).map(
              (l) => ({ name: l.name, status: l.generationStatus })
            ),
            plotThreads: (await db.plotThreads.where('projectId').equals(projectId).toArray()).map(
              (t) => ({ title: t.title, status: t.generationStatus })
            ),
            edges: (await db.graphEdges.where('projectId').equals(projectId).toArray()).map(
              (e) => ({
                from: e.sourceId,
                to: e.targetId,
                type: e.relationshipType,
                fromChapter: e.validFromChapter ?? null,
                untilChapter: e.validUntilChapter ?? null
              })
            )
          },
          consistency: gen.consistencyReport.value,
          // Every critic verdict the run persisted, so the model decision can
          // be made from numbers rather than from the gate's pass/fail alone.
          // The gate's verdict per scene (`gateEval` on the written record) —
          // `evalResults` is only persisted when inline evaluation is on.
          evals: gen.writtenScenes.value.filter(Boolean).map((s, i) => ({
            index: i + 1,
            title: s.title,
            words: words(s.prose),
            score: s.gateEval?.score ?? null,
            pass: s.gateEval?.pass ?? null,
            dimensionScores: s.gateEval?.dimensionScores || null,
            weakest: s.gateEval?.weakestDimension || null,
            issues: (s.gateEval?.issues || []).map((x) => `${x.type}: ${x.description}`),
            unavailable: !!s.gateEval?.evalUnavailable
          }))
        },
        null,
        2
      )
    )

    const sections = (await db.sections.where('projectId').equals(projectId).toArray()).sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    )
    const subs = await db.subsections.where('projectId').equals(projectId).toArray()
    let book = `# ${TITLE}\n\n`
    let total = 0
    for (const s of sections) {
      book += `\n\n## ${s.title}\n`
      const scenes = subs
        .filter((x) => x.sectionId === s.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      for (const sc of scenes) {
        const text = (sc.content || '')
          .replace(/<[^>]+>/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        total += words(text)
        book += `\n\n### ${sc.title}\n\n${text}\n`
      }
    }
    writeFileSync(join(OUT, 'book.md'), book)

    // Per scene: what was written, what the story will remember of it, and
    // whether any prompt this run sent actually contained the whole thing.
    const sceneRows = []
    for (const s of sections) {
      const scenes = subs
        .filter((x) => x.sectionId === s.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      for (const sc of scenes) {
        const prose = (sc.content || '')
          .replace(/<[^>]+>/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        const tail = prose.slice(-120)
        // The summary lives on the generator's `writtenScenes` entry, not on the
        // `subsections` row -- that is where `sceneContext` reads it from when it
        // tells a later scene what happened earlier. Reading `sc.summary` here
        // reported an empty summary for every scene and looked like a data-loss
        // bug; it was this dump looking in the wrong place.
        const written = (gen.writtenScenes?.value || []).find((w) => w && w.subsectionId === sc.id)
        const summary = written?.summary || null
        sceneRows.push({
          title: sc.title,
          // 'review' when the gate could not clear the scene in its attempts.
          contentStatus: sc.contentStatus ?? null,
          words: words(prose),
          chars: prose.length,
          // The old critic cap. True means this scene would have been cut.
          overOldCriticCap: prose.length > 4000,
          summary,
          summaryChars: (summary || '').length,
          // Did ANY prompt carry the scene end? If a scene is over the old cap
          // and this is false, something is still truncating.
          sceneTailReachedAModel: tail.length > 40 && wireCalls.some((c) => c.prompt.includes(tail))
        })
      }
    }
    writeFileSync(join(OUT, 'scenes.json'), JSON.stringify(sceneRows, null, 2))
    writeFileSync(
      join(OUT, 'wire.json'),
      JSON.stringify(
        {
          calls: wireCalls.length,
          focusedCritic: process.env.LIVE_FOCUSED === '1',
          byKind: wireCalls.reduce((acc, c) => {
            acc[c.kind] = (acc[c.kind] || 0) + 1
            return acc
          }, {}),
          wallMinutes: wireCalls.length
            ? +((wireCalls[wireCalls.length - 1].at - wireCalls[0].at) / 60000).toFixed(1)
            : 0,
          maxPromptChars: wireCalls.reduce((m, c) => Math.max(m, c.promptChars), 0),
          // Did the established-facts ledger actually reach a model? Counting
          // the block by its heading is the only proof that the wiring works
          // end to end — a unit test can show the string is built, not that it
          // survived the budget trimmer and got sent.
          storyStatePrompts: wireCalls.filter((c) => c.prompt.includes('ESTABLISHED FACTS')).length,
          storyStateSample: (() => {
            const hit = wireCalls.find((c) => c.prompt.includes('ESTABLISHED FACTS'))
            if (!hit) return null
            const start = hit.prompt.indexOf('ESTABLISHED FACTS')
            return hit.prompt.slice(start, start + 600)
          })(),
          byModel: wireCalls.reduce((acc, c) => {
            acc[c.model] = (acc[c.model] || 0) + 1
            return acc
          }, {}),
          // Prompts themselves stay out of the dump: the sizes are the signal,
          // and a book's prose does not need a second copy on disk.
          promptChars: wireCalls.map((c) => c.promptChars)
        },
        null,
        2
      )
    )
    log(
      `scenes dumped: ${sceneRows.length}, over old critic cap: ${sceneRows.filter((r) => r.overOldCriticCap).length}, ` +
        `tail reached a model: ${sceneRows.filter((r) => r.sceneTailReachedAModel).length}/${sceneRows.length}`
    )
    log(
      `done phase=${gen.phase.value} error=${gen.error.value} chapters=${sections.length} scenes=${subs.length} words=${total} bibleChanges=${gen.bibleChangesDiscovered.value} synced=${gen.scenesSynced.value}`
    )

    expect(gen.error.value).toBeNull()
    expect(gen.phase.value).toBe('complete')
  })
})
