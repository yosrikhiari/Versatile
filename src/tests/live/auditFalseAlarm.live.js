/**
 * Live experiment: how often does the chapter audit's contradiction judge
 * accuse correct prose?
 *
 *   npx vitest run --config vitest.live.config.js src/tests/live/auditFalseAlarm.live.js
 *
 * `checkContradictions` drives ConsistencyService's chapter-boundary audit, and
 * its findings trigger rewrites. §22 re-graded the §14 scenes and read two of
 * its heaviest verdicts by hand (6 and 4 flags): neither scene contradicted its
 * ledger. This measures that at scale, the way §20 measured the isolated
 * checker: every corpus scene, clean and with the planted "X had been dead for
 * two years", judged against its own ledger, called as the §14 probe called it
 * (the cast's last four prior scenes plus the target, which is also how the
 * audit groups scenes). The flagged text is saved so every verdict can be read.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const MODEL = process.env.LIVE_MODEL || 'qwen3:8b'
// FOCUSED=1 measures the isolated audit path (§23) through the same function.
const OUT = join(
  process.cwd(),
  'reports',
  'live',
  process.env.FOCUSED === '1' ? 'audit-false-alarm-focused' : 'audit-false-alarm'
)
mkdirSync(OUT, { recursive: true })

const PLANT = (prose, bible) => {
  const name = (bible.match(/\b(Nesrin|Halim|Ahmed|Yusuf|Kemal|Idris)\b/) || [])[1] || 'Halim'
  const paras = prose.split(/\n\s*\n/)
  paras.splice(
    Math.max(1, Math.floor(paras.length / 2)),
    0,
    `${name} had been dead for two years by then, buried past the salt flats, ` +
      `and everyone on the road knew it. No debt had ever passed between them.`
  )
  return paras.join('\n\n')
}

describe('live: audit contradiction judge on clean and planted prose', () => {
  it('judges every corpus scene both ways and saves what it flagged', async () => {
    const corpusPath = join(
      process.cwd(),
      'reports',
      'live',
      'critic-rank-agreement',
      'corpus.json'
    )
    if (!existsSync(corpusPath)) throw new Error(`missing corpus: ${corpusPath}`)
    const corpus = JSON.parse(readFileSync(corpusPath, 'utf-8'))

    setActivePinia(createPinia())
    localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, HOST)
    localStorage.setItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL, MODEL)
    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ ollamaEndpoint: HOST, ollamaModel: MODEL })
    )
    const { setRolePlacement } = await import('@/config/roles')
    setRolePlacement('critic', { model: MODEL, device: 'gpu', numCtx: 8192, keepAlive: '30m' })
    const { useStoryCritic, setFocusedCritic } = await import('@/composables/useStoryCritic')
    setFocusedCritic(process.env.FOCUSED === '1')
    const critic = useStoryCritic()

    const rows = []
    const t0 = Date.now()
    for (const target of corpus) {
      const ledger = target.storyBible
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const cast = (target.sceneBrief.charactersPresent || []).map(String)
      const prior = corpus
        .filter((c) => c.index < target.index)
        .filter((c) => (c.sceneBrief.charactersPresent || []).some((n) => cast.includes(String(n))))
        .slice(-4)
        .map((c) => ({
          sceneNumber: c.index,
          title: c.title,
          prose: c.draft,
          characters: (c.sceneBrief.charactersPresent || []).map(String),
          location: c.sceneBrief.location || ''
        }))
      for (const variant of ['control', 'contradiction']) {
        const prose = variant === 'control' ? target.draft : PLANT(target.draft, target.storyBible)
        let report = null
        let error = null
        try {
          report = await critic.checkContradictions({
            characters: cast.map((name) => ({
              name,
              role: '',
              description: `Established by the story so far. ${ledger.slice(0, 6).join(' ')}`
            })),
            locations: [],
            sceneProse: [
              ...prior,
              { sceneNumber: target.index, title: target.title, prose, characters: cast }
            ],
            synopsis: '',
            ledger
          })
        } catch (e) {
          error = String(e?.message || e)
        }
        const flagged = (report?.characterIssues || []).flatMap((i) =>
          (i.contradictions || []).map((c) => ({ character: i.character, ...c }))
        )
        const text = JSON.stringify(flagged).toLowerCase()
        rows.push({
          scene: target.index,
          variant,
          flags: flagged.length,
          plantedNamed: variant === 'contradiction' && /dead|two years|buried/.test(text),
          flagged,
          error
        })
        console.log(`[audit ${target.index} ${variant}] flags=${flagged.length}`)
      }
    }
    const clean = rows.filter((r) => r.variant === 'control')
    const planted = rows.filter((r) => r.variant === 'contradiction')
    writeFileSync(
      join(OUT, 'summary.json'),
      JSON.stringify(
        {
          model: MODEL,
          minutes: +((Date.now() - t0) / 60000).toFixed(1),
          cleanScenesFlagged: clean.filter((r) => r.flags > 0).length,
          cleanFlags: clean.reduce((a, r) => a + r.flags, 0),
          plantedNamed: planted.filter((r) => r.plantedNamed).length,
          scenes: clean.length,
          errors: rows.filter((r) => r.error).length,
          rows
        },
        null,
        2
      )
    )
    expect(rows.length).toBe(corpus.length * 2)
  })
})
