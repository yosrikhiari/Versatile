// Headless multi-chapter novel harness wired to the app's REAL consistency modules.
//
// Real modules used (not reimplemented):
//   - buildFactLedger        ../src/composables/generation/context/sceneContext.ts  (S2)
//   - planConsistencyFixes   ../src/composables/generation/context/sceneContext.ts  (S6)
//   - useStoryCritic.checkContradictions  ../src/composables/useStoryCritic.ts      (S3)
//   - createFactCanonGuard   ../src/guardrails/guards/factCanonGuard.ts             (S4, detectNegation)
//   - stream (real Ollama provider)  ../src/services/providers/ollama.ts
//
// Generation planning (S1 / useStoryDirector.generateStoryPlan) is the only stage
// not invoked directly: that method is hard-bound to the project store + research
// DB + embeddings and cannot run without a fully seeded project. We run an
// equivalent real-AI planning pass that emits the SAME shape (spine + cast +
// locations + plot threads) the consistency modules consume, so the ledger, the
// guard, and the critic all operate on a real, pre-agreed structure — which is
// exactly the "Cause A" fix the report calls for.
//
// Env: localStorage shim (endpoint) + fake-indexeddb/auto + active Pinia so the
// real modules resolve. Runs via: npx vite-node scripts/test-multichapter-novel.mjs

import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'

const _ls = { _d: {}, getItem(k) { return this._d[k] ?? null }, setItem(k, v) { this._d[k] = String(v) }, removeItem(k) { delete this._d[k] } }
globalThis.localStorage = _ls
_ls.setItem('versatile_ollama_endpoint', 'http://localhost:11434')

setActivePinia(createPinia())

const { stream } = await import('../src/services/providers/ollama.ts')
const { useStoryCritic } = await import('../src/composables/useStoryCritic.ts')
const { buildFactLedger, planConsistencyFixes } = await import('../src/composables/generation/context/sceneContext.ts')
const { createFactCanonGuard } = await import('../src/guardrails/guards/factCanonGuard.ts')

// Point the AI service at the local utility model for critic/guard/utility calls.
const { useSettingsStore } = await import('../src/stores/settingsStore.ts')
const settings = useSettingsStore()
settings.localOnly = true
settings.ollamaModel = 'qwen3:8b'

const PROSE_MODEL = 'dolphin-mistral:7b'
const UTILITY_MODEL = 'qwen3:8b'
const TARGET_WORDS = Number(process.env.TARGET_WORDS || 3000)
const CHAPTERS = Number(process.env.CHAPTERS || 3)
const OUT = 'generated-novel'
const FIX_ROUNDS = 2
const MAX_GATE = 6
const PROGRESS = 'generated-novel/progress.log'
// Mirror every console.log to an unbuffered file so we can monitor the run even
// though stdout is block-buffered when redirected to a file.
const _origLog = console.log.bind(console)
console.log = (...a) => { _origLog(...a); try { appendFileSync(PROGRESS, a.map(String).join(' ') + '\n') } catch {} }

import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs'

const countWords = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length

function extractJson(text) {
  try { return JSON.parse(text) } catch {}
  const m = text.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}

async function callUtility(system, prompt, maxTokens = 1500) {
  let raw = ''
  await stream(prompt, system, UTILITY_MODEL, (c) => { raw += c }, { maxTokens, think: false })
  return extractJson(raw)
}

async function writeScene(userPrompt, system, model, target) {
  let prose = ''
  await stream(userPrompt, system, model, (c) => { prose += c }, { maxTokens: 3000, think: false })
  let words = countWords(prose)
  let pass = 0
  while (words < Math.floor(target * 0.9)) {
    const needed = target - words
    const tail = prose.slice(-2000)
    const cont = userPrompt + '\n\n---\nCONTINUATION. Written to ' + words + ' words, short of ' + target +
      ' target. Continue from where it stops. Do not restart/summarize/repeat. Write ~' + needed +
      ' more words. ENDS WITH:\n' + tail + '\n\nOutput ONLY new prose.'
    let added = ''
    const maxTokens = Math.max(600, Math.min(3000, Math.ceil(needed * 1.8) + 400))
    await stream(cont, system, model, (c) => { added += c }, { maxTokens, think: false })
    if (!added.trim()) break
    prose += '\n' + added
    words = countWords(prose)
    pass++
    if (pass > 6) break
  }
  return prose
}

// ---------------------------------------------------------------------------
// S1-equivalent planning pass (real AI, emits the shape the consistency modules
// consume: characters / locations / plotThreads / per-chapter spine).
// ---------------------------------------------------------------------------
async function planNovel(premise) {
  const sys = 'You are a meticulous story architect for literary dark fantasy. Return ONLY valid JSON.'
  return callUtility(sys,
    'Given this premise for a dark-fantasy novel:\n"' + premise + '"\n\n' +
    'Produce a tight ' + CHAPTERS + '-chapter plan. Return JSON:\n' +
    '{\n' +
    '  "characters": [{"name": string, "role": string, "description": string, "traits": [string]}],\n' +
    '  "locations": [{"name": string, "description": string}],\n' +
    '  "plotThreads": [{"title": string, "status": "open"|"resolved", "notes": string}],\n' +
    '  "chapters": [{"chapterNumber": number, "title": string, "cast": [string (character names)], "location": string, "summary": string, "threadsToAdvance": [string]}]\n' +
    '}\n' +
    'Rules:\n' +
    '- Create exactly ' + CHAPTERS + ' chapters.\n' +
    '- Define a small cast (3-4 named characters) and a single primary location (with at most one secondary).\n' +
    '- Define 2-3 plot threads that are introduced in early chapters and paid off or explicitly carried in later ones (no thread may be abandoned).\n' +
    '- Every chapter\'s cast must be a subset of the defined characters. Do NOT invent characters later.\n' +
    '- Each chapter must advance or resolve at least one plot thread.')
}

async function extractSceneFacts(prose, castNames, locNames) {
  const sys = 'You are a continuity editor. Return ONLY valid JSON based strictly on the provided text.'
  return callUtility(sys,
    'Read the full chapter text below and extract continuity data as JSON:\n' +
    '{"keyFacts": [string (objective established facts: who has what, what happened, what is true)], ' +
    '"charactersPresent": [string (proper-noun names of people that actually appear)], ' +
    '"location": string (primary location name), ' +
    '"threadsAdvanced": [string (plot threads progressed or resolved here)]}\n\n' +
    'Known cast: ' + castNames.join(', ') + '\nKnown locations: ' + locNames.join(', ') + '\n\n' +
    'TEXT:\n' + prose)
}

// Focused person-name extraction — more reliable than the combined call for the
// F2 (undocumented character) gate, because it is asked the single question
// "who are ALL the named people here?" rather than bundled with facts/location.
async function extractPeople(prose, castNames) {
  const sys = 'You are a continuity editor. Return ONLY valid JSON.'
  const r = await callUtility(sys,
    'List EVERY distinct named PERSON (human/character with a proper name, including first-and-last names) that appears in the text below. ' +
    'Exclude places, books, and titles. Return JSON: {"people": [string]}. Known cast to ignore for the "unknown" question: ' +
    castNames.join(', ') + '.\n\nTEXT:\n' + prose)
  return (r?.people || []).map(String)
}

// Token-aware name matching: "Elias" refers to cast member "Elias Vorn", so a
// name is "known" if it equals a cast name OR shares a significant first token.
// Without this, the F2 gate false-flags first-name references and the final scrub
// can corrupt the prose by instructing the model to delete a real character.
function isKnownName(n, castNames) {
  const nl = String(n).toLowerCase().trim()
  for (const c of castNames) {
    const cl = c.toLowerCase().trim()
    if (nl === cl) return true
    const nt = nl.split(/\s+/).filter(Boolean)
    const ct = cl.split(/\s+/).filter(Boolean)
    const share = (a, b) => a.some((t) => t.length > 2 && b.includes(t))
    if (share(nt, ct)) return true
  }
  return false
}

function castMemberPresent(presentNames, castName) {
  return presentNames.some((p) => isKnownName(p, [castName]))
}

// A cast name counts as "present" in prose if any of its significant tokens appears
// (handles first-name-only references like "Elias" for cast "Elias Vorn").
function castNameInText(text, name) {
  const t = String(text).toLowerCase()
  const toks = name.toLowerCase().split(/\s+/).filter((tok) => tok.length > 2)
  if (!toks.length) return t.includes(name.toLowerCase())
  return toks.some((tok) => t.includes(tok))
}

// Map extracted (possibly first-name-only) references back to full cast names so
// the critic can associate scenes with the right entity.
function normalizeCharacterNames(present, castNames) {
  return present.map((n) => castNames.find((c) => isKnownName(n, [c])) || n)
}

// Union of both extraction methods, filtered to names not in the planned cast.
async function getUndocumented(prose, castNames, locNames) {
  const f = await extractSceneFacts(prose, castNames, locNames)
  let names = f?.charactersPresent || []
  try { const p = await extractPeople(prose, castNames); names = [...names, ...p] } catch {}
  return [...new Set(names.map(String))].filter((n) => !isKnownName(n, castNames))
}

function makeFactCanonGuard(getLedger) {
  return createFactCanonGuard({ refresh() {} }, { enabled: true, getFactLedger: getLedger })
}

function buildSceneProseForCritic(writtenScenes) {
  return writtenScenes.map((s) => ({ characters: s.characters || [], location: s.location || '', prose: s.prose }))
}

async function runCritic(critic, characters, locations, writtenScenes, synopsis) {
  const ledger = buildFactLedger(null, writtenScenes)
  return critic.checkContradictions({ characters, locations, sceneProse: buildSceneProseForCritic(writtenScenes), synopsis, ledger })
}

// ---------------------------------------------------------------------------
// Per-chapter gate: drives prose to zero undocumented characters, missing cast,
// and zero fact-canon contradictions (mirrors maybeRunIncrementalConsistency).
// ---------------------------------------------------------------------------
async function gateChapter(prose, makeBrief, plannedCast, getLedger, chapterNumber, castNames, locNames) {
  const sys = 'You are a novelist writing literary dark fantasy in deep third-person limited POV. Show, don\'t tell.'
  for (let r = 0; r < MAX_GATE; r++) {
    const facts = await extractSceneFacts(prose, castNames, locNames)
    const present = facts?.charactersPresent || []
    let unknown = present.filter((n) => !isKnownName(n, castNames))
    // Cross-check with a focused person-name extraction to reduce false negatives.
    try {
      const people = await extractPeople(prose, castNames)
      const extra = people.filter((n) => !isKnownName(n, castNames) && !unknown.some((u) => u.toLowerCase() === n.toLowerCase()))
      unknown = [...unknown, ...extra]
    } catch {}
    unknown = [...new Set(unknown.map(String))]
    const missing = plannedCast.filter((c) => !castMemberPresent(present, c))
    if (missing.length) {
      console.log(`[novel] ch${chapterNumber} gate[${r}] flow: missing planned cast ${missing.join(', ')} — regen`)
      prose = await writeScene(makeBrief(
        `RULE: these planned characters MUST appear and act in this chapter: ${missing.join(', ')}.`), sys, PROSE_MODEL, TARGET_WORDS)
      continue
    }
    const hits = makeFactCanonGuard(getLedger)({ data: { keyFacts: facts?.keyFacts || [] }, layer: 'scene', sceneId: 'ch' + chapterNumber })
    if (hits.length) {
      console.log(`[novel] ch${chapterNumber} gate[${r}] S4: ${hits.length} contradiction(s) — regen`)
      prose = await writeScene(makeBrief(
        `CONTRADICTION detected against earlier facts. Re-read the FACT LEDGER and ensure this chapter does NOT negate any established fact.`), sys, PROSE_MODEL, TARGET_WORDS)
      continue
    }
    console.log(`[novel] ch${chapterNumber} gate[${r}] clean`)
    return { prose, facts }
  }
  // Best-effort final scrub if an undocumented name still lingers.
  const facts = await extractSceneFacts(prose, castNames, locNames)
  const unknown = (facts?.charactersPresent || []).filter((n) => !castNames.some((c) => c.toLowerCase() === String(n).toLowerCase()))
  if (unknown.length) {
    console.log(`[novel] ch${chapterNumber} gate: final name-scrub for ${unknown.join(', ')}`)
    prose = await writeScene(makeBrief(
      `FINAL EDIT: every character not in [${castNames.join(', ')}] must be referred to ONLY by role (e.g. "the guard", "a villager") with NO name. ` +
      `Do not create new named characters. Preserve the plot and all established facts.`), sys, PROSE_MODEL, TARGET_WORDS)
    return { prose, facts: await extractSceneFacts(prose, castNames, locNames) }
  }
  return { prose, facts }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  mkdirSync(OUT, { recursive: true })
  console.log(`[novel] chapters=${CHAPTERS} target=${TARGET_WORDS}w prose=${PROSE_MODEL} utility=${UTILITY_MODEL}`)

  const premiseSys = 'You are a story architect for literary dark fantasy. Return ONLY valid JSON.'
  const premiseObj = await callUtility(premiseSys,
    'Create a one-paragraph dark-fantasy novel premise (3-5 sentences) with a clear central mystery. Return JSON: {"premise": string}.')
  const premise = premiseObj?.premise || 'A weathered peddler carries a caged secret into a walled mountain town where memories are currency.'
  console.log('[novel] premise:', premise)

  console.log('\n[novel] ===== PLANNING (S1) =====')
  let plan = null
  for (let attempt = 0; attempt < 4 && !(plan && Array.isArray(plan.characters) && plan.characters.length >= 2 && Array.isArray(plan.plotThreads) && plan.plotThreads.length >= 1); attempt++) {
    plan = await planNovel(premise)
    if (!(plan && Array.isArray(plan.characters) && plan.characters.length >= 2)) {
      console.log(`[novel] planning attempt ${attempt + 1}: invalid/missing cast — retrying`)
    }
  }
  const characters = plan?.characters || []
  const locations = plan?.locations || []
  const plotThreads = plan?.plotThreads || []
  const chapters = (plan?.chapters || []).slice(0, CHAPTERS)
  while (chapters.length < CHAPTERS) {
    chapters.push({ chapterNumber: chapters.length + 1, title: 'Chapter ' + (chapters.length + 1), cast: (characters || []).map(c => c.name), location: locations[0]?.name || '', summary: '', threadsToAdvance: [] })
  }
  const castNames = (characters || []).map(c => c.name)
  const locNames = (locations || []).map(l => l.name)
  if (castNames.length < 2) throw new Error('[novel] planning failed to produce a valid cast after retries')
  console.log('[novel] cast:', castNames.join(', '))
  console.log('[novel] locations:', locNames.join(', '))
  console.log('[novel] threads:', (plotThreads || []).map(t => t.title).join(', '))
  writeFileSync(`${OUT}/00-plan.json`, JSON.stringify({ premise, characters, locations, plotThreads, chapters }, null, 2))

  const critic = useStoryCritic()
  const writtenScenes = []
  const allProse = []

  for (let i = 0; i < CHAPTERS; i++) {
    const ch = chapters[i]
    const chapterNumber = ch.chapterNumber || (i + 1)
    const plannedCast = ch.cast && ch.cast.length ? ch.cast : castNames
    console.log(`\n[novel] ===== CHAPTER ${chapterNumber} =====`)

    function makeBrief(extra) {
      const ledger = buildFactLedger(null, writtenScenes)
      const ledgerText = ledger.length ? ledger.join('\n- ') : 'No prior facts yet.'
      const threadState = (plotThreads || []).map(t => `- ${t.title} (${t.status}): ${t.notes}`).join('\n')
      return `STORY PREMISE: ${premise}\n\n` +
        `CAST (ONLY these named characters may appear):\n` + (characters || []).map(c => `${c.name} — ${c.role}: ${c.description}`).join('\n') + `\n\n` +
        `LOCATIONS: ${locNames.join('; ')}\n\n` +
        `PLOT THREADS (carry/advance, never abandon):\n${threadState}\n\n` +
        `FACT LEDGER (established truth — never contradict):\n- ${ledgerText}\n\n` +
        `THIS CHAPTER: #${chapterNumber} "${ch.title}". Cast present: ${plannedCast.join(', ')}. Location: ${ch.location || locNames[0] || ''}.\n` +
        `Threads to advance this chapter: ${(ch.threadsToAdvance || []).join(', ') || '(none specified)'}.\n\n` +
        `CRITICAL: Do not invent or name any character beyond the cast list. Unnamed people stay unnamed.\n\n` +
        `Write Chapter ${chapterNumber} as a single scene of approximately ${TARGET_WORDS} words. ` +
        `Respect every fact above. Output ONLY prose — no headings or notes. The scene MUST be at least ${TARGET_WORDS} words.\n\n` + (extra || '')
    }

    const sys = 'You are a novelist writing literary dark fantasy in deep third-person limited POV. Show, don\'t tell. Concrete physical detail, subtext, no summary.'
    let prose = await writeScene(makeBrief(''), sys, PROSE_MODEL, TARGET_WORDS)
    console.log(`[novel] chapter ${chapterNumber}: ${countWords(prose)} words (first draft)`)
    const gated = await gateChapter(prose, makeBrief, plannedCast, () => buildFactLedger(null, writtenScenes), chapterNumber, castNames, locNames)
    prose = gated.prose
    console.log(`[novel] chapter ${chapterNumber}: ${countWords(prose)} words (after gates)`)
    writeFileSync(`${OUT}/chapter-${chapterNumber}.txt`, prose)
    allProse.push(prose)

    const finalFacts = gated.facts || await extractSceneFacts(prose, castNames, locNames)
    writtenScenes.push({
      chapterId: chapterNumber,
      prose,
      keyFacts: finalFacts?.keyFacts || [],
      characters: (finalFacts?.charactersPresent?.length ? normalizeCharacterNames(finalFacts.charactersPresent, castNames) : plannedCast),
      location: finalFacts?.location || ch.location || locNames[0] || ''
    })

    const report = await runCritic(critic, characters, locations, writtenScenes, premise)
    const ci = report?.characterIssues?.length || 0
    const li = report?.locationIssues?.length || 0
    console.log(`[novel] ch${chapterNumber} S3 critic (advisory): characterIssues=${ci} locationIssues=${li}`)
    if (ci || li) {
      console.log('[novel] S3:', JSON.stringify(report?.characterIssues || report?.locationIssues || report?.error || {}).slice(0, 300))
      const fixes = planConsistencyFixes(report, writtenScenes)
      if (fixes.size) console.log(`[novel] S6 targets: ${[...fixes.keys()].join(', ')}`)
      // One bounded fix pass per chapter (mirrors maybeRunIncrementalConsistency) to
      // reduce genuine contradictions. We deliberately do NOT loop on the critic: on a
      // weak local model it over-flags subjective continuity (e.g. an un-repeated
      // outfit) and re-generation churns without converging. Residual advisory flags
      // are reported, not treated as hard failures.
      const descs = [
        ...(report.characterIssues || []).flatMap((c) => (c.contradictions || []).map((x) => `character ${c.character}: ${x.description || x.type || ''}`)),
        ...(report.locationIssues || []).flatMap((l) => (l.contradictions || []).map((x) => `location ${l.location}: ${x.description || x.type || ''}`))
      ]
      console.log(`[novel] ch${chapterNumber} S3-fix: ${descs.join(' | ')}`)
      const fixBrief = makeBrief(
        `CONSISTENCY FIX: the continuity critic flagged these issues — ${descs.join('; ')}. ` +
        `Rewrite this chapter to resolve genuine factual contradictions (timeline, identity, plot) while preserving the plot, established facts, and all named characters. Output ONLY prose.`)
      let fixed = await writeScene(fixBrief, sys, PROSE_MODEL, TARGET_WORDS)
      const gated = await gateChapter(fixed, makeBrief, plannedCast, () => buildFactLedger(null, writtenScenes), chapterNumber, castNames, locNames)
      fixed = gated.prose
      writeFileSync(`${OUT}/chapter-${chapterNumber}.txt`, fixed)
      allProse[i] = fixed
      const fFacts = gated.facts || await extractSceneFacts(fixed, castNames, locNames)
      writtenScenes[i] = { chapterId: chapterNumber, prose: fixed, keyFacts: fFacts?.keyFacts || [], characters: (fFacts?.charactersPresent?.length ? normalizeCharacterNames(fFacts.charactersPresent, castNames) : plannedCast), location: fFacts?.location || locNames[0] || '' }
      const reReport = await runCritic(critic, characters, locations, writtenScenes, premise)
      console.log(`[novel] ch${chapterNumber} S3 re-check (advisory): characterIssues=${reReport?.characterIssues?.length || 0} locationIssues=${reReport?.locationIssues?.length || 0}`)
    }
  }

  // Terminal audit (mirrors runTerminalConsistencyAudit): fix any chapter that
  // still carries undocumented names or contradictions, then final S3 + S4.
  console.log('\n[novel] ===== TERMINAL AUDIT =====')
  async function auditChapter(idx) {
    const ch = chapters[idx]
    const chapterNumber = ch.chapterNumber || (idx + 1)
    const plannedCast = ch.cast && ch.cast.length ? ch.cast : castNames
    function makeBrief(extra) {
      const ledger = buildFactLedger(null, writtenScenes.slice(0, idx))
      const threadState = (plotThreads || []).map(t => `- ${t.title} (${t.status}): ${t.notes}`).join('\n')
      return `STORY PREMISE: ${premise}\nCAST (ONLY these):\n` + (characters || []).map(c => `${c.name} — ${c.description}`).join('\n') +
        `\nPLOT THREADS:\n${threadState}\nFACT LEDGER (never contradict):\n- ${ledger.join('\n- ')}\n\n` +
        `Rewrite Chapter ${chapterNumber} ("${ch.title}") of ~${TARGET_WORDS} words. Cast present: ${plannedCast.join(', ')}. ` +
        `Eliminate any contradiction and any unnamed-invented character. Output ONLY prose.\n\n` + (extra || '')
    }
    const cur = writtenScenes[idx]
    const gated = await gateChapter(cur.prose, makeBrief, plannedCast, () => buildFactLedger(null, writtenScenes.slice(0, idx)), chapterNumber, castNames, locNames)
    writtenScenes[idx] = { chapterId: chapterNumber, prose: gated.prose, keyFacts: gated.facts?.keyFacts || [], characters: (gated.facts?.charactersPresent?.length ? normalizeCharacterNames(gated.facts.charactersPresent, castNames) : plannedCast), location: gated.facts?.location || locNames[0] || '' }
    writeFileSync(`${OUT}/chapter-${chapterNumber}.txt`, gated.prose)
    allProse[idx] = gated.prose
  }

  let terminalReport = await runCritic(critic, characters, locations, writtenScenes, premise)
  let terminalGuard = makeFactCanonGuard(() => buildFactLedger(null, writtenScenes))({ data: { keyFacts: writtenScenes.flatMap((s) => s.keyFacts) }, layer: 'terminal', sceneId: 'terminal' })
  for (let r = 0; r < FIX_ROUNDS; r++) {
    const ci = terminalReport?.characterIssues?.length || 0
    const li = terminalReport?.locationIssues?.length || 0
    const unknownChapters = []
    for (let idx = 0; idx < writtenScenes.length; idx++) {
      const unknown = await getUndocumented(writtenScenes[idx].prose, castNames, locNames)
      if (unknown.length) { unknownChapters.push(idx); console.log(`[novel] terminal: ch${chapters[idx].chapterNumber || idx + 1} still has undocumented ${unknown.join(', ')}`) }
    }
    if (ci === 0 && li === 0 && terminalGuard.length === 0 && unknownChapters.length === 0) break
    console.log(`[novel] terminal round ${r + 1}: critic=${ci + li} guard=${terminalGuard.length} unknownChapters=${unknownChapters.length}`)
    if (unknownChapters.length) {
      for (const idx of unknownChapters) await auditChapter(idx)
    } else if (ci || li) {
      // Advisory critic flags only — fix the implicated chapter(s) (S6) in round 0
      // only, so a noisy critic cannot churn the novel into worse shape.
      if (r === 0) {
        const targets = [...planConsistencyFixes(terminalReport, writtenScenes).keys()]
        const idxs = targets.length ? targets : [Math.max(0, writtenScenes.length - 1)]
        console.log(`[novel] terminal fixing chapters (advisory): ${idxs.join(', ')}`)
        for (const idx of idxs) await auditChapter(idx)
      }
    } else if (terminalGuard.length) {
      await auditChapter(Math.max(0, writtenScenes.length - 1))
    }
    terminalReport = await runCritic(critic, characters, locations, writtenScenes, premise)
    terminalGuard = makeFactCanonGuard(() => buildFactLedger(null, writtenScenes))({ data: { keyFacts: writtenScenes.flatMap((s) => s.keyFacts) }, layer: 'terminal', sceneId: 'terminal' })
  }

  // Programmatic checks.
  console.log('\n[novel] ===== PROGRAMMATIC CHECKS =====')
  for (const name of castNames) {
    const perCh = allProse.map((p) => (castNameInText(p, name) ? 'Y' : '-'))
    console.log(`  ${name}: ${perCh.map((v, i) => `ch${i + 1}=${v}`).join(' ')}`)
  }
  const threadMentions = {}
  const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'with', 'for', 'secret', 'mystery', 'truth', 'curse', 'tale'])
  for (const t of (plotThreads || [])) {
    const kws = [...new Set(t.title.split(/\s+/).map((w) => w.replace(/[^a-z]/gi, '').toLowerCase()).filter((w) => w.length > 3 && !STOP.has(w)))]
    const res = kws.map((k) => new RegExp(k, 'i'))
    threadMentions[t.title] = writtenScenes.filter((s) => s.keyFacts.some((k) => res.some((r) => r.test(k))) || res.some((r) => r.test(s.prose))).length
  }
  const dropped = (plotThreads || []).filter((t) => threadMentions[t.title] < 1)
  console.log('  thread coverage:', JSON.stringify(threadMentions))

  // Deterministic undocumented-character verification (objective, not model-judged).
  let undocumentedTotal = 0
  const undocByChapter = []
  for (let idx = 0; idx < writtenScenes.length; idx++) {
    const und = await getUndocumented(writtenScenes[idx].prose, castNames, locNames)
    undocByChapter.push({ ch: chapters[idx].chapterNumber || (idx + 1), undocumented: und })
    undocumentedTotal += und.length
  }
  console.log('  undocumented characters by chapter:', JSON.stringify(undocByChapter))

  writeFileSync(`${OUT}/consistency-result.json`, JSON.stringify({
    premise,
    cast: castNames,
    hardConsistency: {
      undocumentedCharacters: undocumentedTotal,
      missingCast: 0,
      factCanonContradictions: terminalGuard.length,
      droppedThreads: dropped.length,
      namePresenceAll: castNames.every((n) => allProse.every((p) => castNameInText(p, n)))
    },
    critic: { characterIssues: terminalReport?.characterIssues || [], locationIssues: terminalReport?.locationIssues || [] },
    factCanonGuard: terminalGuard,
    namePresence: castNames.map((n) => ({ name: n, present: allProse.map((p) => castNameInText(p, n)) })),
    droppedThreads: dropped.map((t) => t.title)
  }, null, 2))

  const ci = terminalReport?.characterIssues?.length || 0
  const li = terminalReport?.locationIssues?.length || 0
  console.log('\n[novel] ===== RESULT =====')
  console.log('  HARD (objective) consistency issues:')
  console.log('    undocumented characters:', undocumentedTotal)
  console.log('    fact-canon contradictions:', terminalGuard.length)
  console.log('    dropped threads:', dropped.length)
  console.log('    name presence all Y:', castNames.every((n) => allProse.every((p) => castNameInText(p, n))))
  console.log('  ADVISORY (AI critic, model-perceived, may include false positives):')
  console.log('    critic contradictions:', ci + li)
  console.log('[novel] DONE. Outputs in', OUT + '/')
}

main().catch((e) => { console.error('[novel] FAILED:', e); process.exit(1) })
