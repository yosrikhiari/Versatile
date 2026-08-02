import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { createHash } from 'crypto'
import { join, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import { deriveVerdict } from '../../src/services/criticVerdict.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')

/**
 * Corpus location. Defaults to `corpus/`; point `EVAL_CORPUS_DIR` at
 * `src/tests/fixtures/eval-corpus` to run the fixture-shaped corpus instead.
 * Both layouts are accepted — see `normalizeFixture`.
 */
const CORPUS_DIR = process.env.EVAL_CORPUS_DIR
  ? (isAbsolute(process.env.EVAL_CORPUS_DIR)
      ? process.env.EVAL_CORPUS_DIR
      : join(REPO_ROOT, process.env.EVAL_CORPUS_DIR))
  : join(REPO_ROOT, 'corpus')

const SNAPSHOT_DIR = join(CORPUS_DIR, '__snapshots__')

export function getCorpusDir() {
  return CORPUS_DIR
}

/** Fixture basenames (without .json) in the active corpus. */
export function listFixtureNames() {
  if (!existsSync(CORPUS_DIR)) {
    throw new Error(`Corpus directory not found: ${CORPUS_DIR}`)
  }
  return readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.json') && !/readme/i.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
}

/**
 * Accepts either corpus layout and returns the shape `buildPrompt` expects.
 *
 * - `corpus/`                      → { _meta, scene, categoryType, ... }
 * - `src/tests/fixtures/eval-corpus/` → { sceneId, sceneBrief, workspaceType, ... }
 *
 * The returned object keeps the original `corpus/` key names so `buildPrompt`
 * produces byte-identical prompts — changing them would invalidate the prompt
 * hash of every stored snapshot.
 */
function normalizeFixture(raw, name) {
  return {
    ...raw,
    sceneId: raw.sceneId || name,
    scene: raw.scene || raw.sceneBrief || {},
    categoryType: raw.categoryType || raw.workspaceType || 'creative',
    _meta: raw._meta || {}
  }
}

const CREATIVE_DIMS = ['continuity', 'voice', 'emotional_goal', 'show_tell', 'pacing']

const TYPE_DIMENSIONS = {
  creative: CREATIVE_DIMS,
  novel: CREATIVE_DIMS,
  screenplay: CREATIVE_DIMS,
  legal: ['clarity', 'ambiguity', 'liability', 'missing_provision'],
  technical: ['architecture', 'interface', 'security', 'validation'],
  business: ['structure', 'evidence', 'clarity', 'feasibility'],
  research: ['methodology', 'evidence', 'reproducibility', 'structure']
}

const CRITIC_SYSTEM_PROMPTS = {
  creative: `You are an expert story editor and literary critic. Evaluate if the scene matches its emotional goals, character wants, and tension. Ensure smooth pacing and no filler. Pass score threshold is 7/10. Return JSON: { "pass": boolean, "score": number, "dimensionScores": { "continuity": number, "voice": number, "emotional_goal": number, "show_tell": number, "pacing": number }, "issues": [{ "type": "continuity"|"voice"|"emotional_goal"|"show_tell"|"pacing", "description": "string", "severity": "minor"|"major" }], "strengths": ["string"] }`,
  novel: `You are a developmental editor evaluating a novel chapter. Assess narrative voice consistency, POV adherence, chapter-level pacing, emotional stakes, dialogue authenticity, and whether the chapter ends with a compelling hook or unresolved tension. Check for continuity across the wider story. Pass score threshold is 7/10. Return JSON: { "pass": boolean, "score": number, "dimensionScores": { "continuity": number, "voice": number, "emotional_goal": number, "show_tell": number, "pacing": number }, "issues": [{ "type": "continuity"|"voice"|"emotional_goal"|"show_tell"|"pacing", "description": "string", "severity": "minor"|"major" }], "strengths": ["string"] }`,
  legal: `You are an independent legal validator. Evaluate the clause for clarity, ambiguity, balance, and liability vulnerabilities. Look out for missing penalty thresholds, loopholes, or unbalanced covenants. Pass score threshold is 8/10. Return JSON: { "pass": boolean, "score": number, "dimensionScores": { "clarity": number, "ambiguity": number, "liability": number, "missing_provision": number }, "issues": [{ "type": "clarity"|"ambiguity"|"liability"|"missing_provision", "description": "string", "severity": "minor"|"major" }], "strengths": ["string"] }`,
  technical: `You are a Senior Technical Architect reviewing the design specification. Check for architectural flaws, missing interfaces, validation requirements, security loopholes (e.g. rate limits, injection rules), and compliance. Pass score threshold is 8/10. Return JSON: { "pass": boolean, "score": number, "dimensionScores": { "architecture": number, "interface": number, "security": number, "validation": number }, "issues": [{ "type": "architecture"|"interface"|"security"|"validation", "description": "string", "severity": "minor"|"major" }], "strengths": ["string"] }`,
  business: `You are an experienced business consultant reviewing a strategy plan. Assess the plan's structure, evidence quality, clarity, and feasibility. Check for logical gaps and unsupported claims. Pass score threshold is 7/10. Return JSON: { "pass": boolean, "score": number, "dimensionScores": { "structure": number, "evidence": number, "clarity": number, "feasibility": number }, "issues": [{ "type": "structure"|"evidence"|"clarity"|"feasibility", "description": "string", "severity": "minor"|"major" }], "strengths": ["string"] }`,
  research: `You are a peer reviewer evaluating a research abstract or findings. Assess methodology, evidence quality, reproducibility, and structural clarity. Check for unsupported inferences and citation needs. Pass score threshold is 8/10. Return JSON: { "pass": boolean, "score": number, "dimensionScores": { "methodology": number, "evidence": number, "reproducibility": number, "structure": number }, "issues": [{ "type": "methodology"|"evidence"|"reproducibility"|"structure", "description": "string", "severity": "minor"|"major" }], "strengths": ["string"] }`
}

function getDimensionNames(type) {
  return TYPE_DIMENSIONS[type] || CREATIVE_DIMS
}

function getCriticSystemPrompt(type) {
  return CRITIC_SYSTEM_PROMPTS[type] || CRITIC_SYSTEM_PROMPTS.creative
}

function getDefaultThreshold(type) {
  const dims = getDimensionNames(type)
  const byThreshold = {
    continuity: 7, voice: 7, emotional_goal: 7, show_tell: 7, pacing: 7,
    clarity: 8, ambiguity: 8, liability: 8, missing_provision: 8,
    architecture: 8, interface: 8, security: 8, validation: 8,
    structure: 7, evidence: 7, feasibility: 7,
    methodology: 8, reproducibility: 8
  }
  if (dims.length === 0) return 7
  const sum = dims.reduce((s, d) => s + (byThreshold[d] ?? 7), 0)
  return sum / dims.length
}

function countCharacters(storyBible) {
  if (!storyBible) return 0
  const matches = storyBible.match(/##\s+\w+/g)
  return matches ? matches.length : 0
}

export function buildPrompt(fixture) {
  const { scene, draft, storyBible, chapterLog, existingEntitiesJson, categoryType } = fixture
  const type = categoryType || 'creative'

  const characterCount = countCharacters(storyBible)
  const hasFewCharacters = characterCount < 2

  const promptDims = getDimensionNames(type)
  const dimsList = promptDims.map((d) => `  - ${d}`).join('\n')

  const systemPrompt = getCriticSystemPrompt(type)

  const userPrompt = `Evaluate this scene draft across ALL of the following dimensions:
${dimsList}

You MUST provide a score (1-10) for each dimension in the "dimensionScores" field of your JSON response.

SCENE BRIEF:
- Title: ${scene.title}
- Emotional goal: ${scene.emotionalGoal}
- Characters present: ${scene.charactersPresent.join(', ')}
- Payoff: ${scene.payoff}
- Tension: ${scene.tension}

CHAPTER LOG (previous events):
${chapterLog || '(First scene)'}

EXISTING ENTITIES CONTEXT:
${existingEntitiesJson || '(No existing entities)'}

STORY BIBLE (character descriptions for voice check):
${storyBible || '(No story bible)'}

${hasFewCharacters ? 'NOTE: Fewer than 2 characters defined. Skip continuity and voice checks.' : ''}

DRAFT TEXT:
${(draft || '').slice(0, 4000)}

Return JSON evaluation with dimensionScores covering all listed dimensions.`

  const hash = createHash('sha256')
  hash.update(systemPrompt)
  hash.update(userPrompt)
  const promptHash = hash.digest('hex')

  return { systemPrompt, userPrompt, promptHash, dimensionNames: promptDims, hasFewCharacters, threshold: getDefaultThreshold(type) }
}

export function readFixture(name) {
  const base = name.replace(/\.json$/, '')
  const path = join(CORPUS_DIR, `${base}.json`)
  if (!existsSync(path)) {
    throw new Error(`Fixture not found: ${path}`)
  }
  return normalizeFixture(JSON.parse(readFileSync(path, 'utf-8')), base)
}

export let lastApiError = null

/**
 * Which backend records the baseline.
 *
 * This used to be OpenAI, unconditionally. In a product whose primary inference
 * path is a local Ollama, that made the critic's own regression gate the one
 * thing that could not run without a cloud key — and it is very likely why
 * `corpus/__snapshots__/` sat empty and `--check-all` had no baseline to fail
 * against for as long as it existed.
 *
 * Defaults to whatever is actually available: OpenAI when a key is present,
 * Ollama otherwise. `SNAPSHOT_PROVIDER` forces either.
 */
export function resolveSnapshotProvider() {
  const explicit = (process.env.SNAPSHOT_PROVIDER || '').toLowerCase()
  if (explicit === 'ollama' || explicit === 'openai') return explicit
  return process.env.OPENAI_API_KEY ? 'openai' : 'ollama'
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'

async function callOllama(systemPrompt, userPrompt) {
  const model = process.env.SNAPSHOT_MODEL || 'qwen3:8b'
  const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      // Reasoning models spend output budget on thinking before the JSON, and
      // the critique object itself is small — hence the generous ceiling.
      think: false,
      format: 'json',
      options: { temperature: 0.3, num_predict: 2000, num_ctx: 16384 }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    lastApiError = { status: response.status, body }
    throw new Error(`Ollama error ${response.status}: ${body}`)
  }

  const data = await response.json()
  const content = data.response
  if (!content) {
    lastApiError = { status: response.status, data }
    throw new Error(`Empty response from Ollama: ${JSON.stringify(data).slice(0, 300)}`)
  }

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch {
    lastApiError = { status: response.status, content }
    throw new Error(`Invalid JSON from Ollama: ${String(content).slice(0, 300)}`)
  }

  return { parsed, model: `ollama/${model}`, rawContent: content }
}

export async function callAI(systemPrompt, userPrompt) {
  if (resolveSnapshotProvider() === 'ollama') {
    return callOllama(systemPrompt, userPrompt)
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Either set it, or set SNAPSHOT_PROVIDER=ollama to record the baseline locally.'
    )
  }
  const model = process.env.SNAPSHOT_MODEL || 'gpt-4o-mini'

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    lastApiError = { status: response.status, body }
    throw new Error(`OpenAI API error ${response.status}: ${body}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    lastApiError = { status: response.status, data }
    throw new Error(`Empty response from OpenAI: ${JSON.stringify(data)}`)
  }

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch {
    lastApiError = { status: response.status, content }
    throw new Error(`Invalid JSON from AI: ${content}`)
  }

  return { parsed, model, rawContent: content }
}

function snapshotPath(fixtureName) {
  const base = fixtureName.replace(/\.json$/, '')
  return join(SNAPSHOT_DIR, `${base}.snapshot.json`)
}

export function hasSnapshot(fixtureName) {
  return existsSync(snapshotPath(fixtureName))
}

export function loadSnapshot(fixtureName) {
  const path = snapshotPath(fixtureName)
  if (!existsSync(path)) {
    throw new Error(`No snapshot found at ${path}. Run --take first.`)
  }
  return JSON.parse(readFileSync(path, 'utf-8'))
}

/**
 * Runs the critic live against a fixture and returns the result *without*
 * writing a snapshot. This is what regression checking compares against the
 * stored baseline — `takeSnapshot` would overwrite the very baseline we are
 * trying to measure against.
 */
export async function runCritic(fixtureName) {
  const fixture = readFixture(fixtureName)
  const { systemPrompt, userPrompt, promptHash, dimensionNames, threshold } = buildPrompt(fixture)
  const { parsed, model } = await callAI(systemPrompt, userPrompt)

  // Derived, not taken from `parsed.pass`.
  //
  // This tool used to record the model's OWN pass/fail boolean verbatim — not
  // even a threshold comparison. So the regression gate for the critic was the
  // critic marking its own homework, and it duly passed a deliberately
  // contradictory fixture. Using the app's `deriveVerdict` means the harness and
  // the pipeline cannot drift apart, the same reason sweep-writer.js now imports
  // the real `gateProseQuality` instead of reimplementing it.
  const dimensionScores = parsed.dimensionScores || {}
  const issues = Array.isArray(parsed.issues) ? parsed.issues : []
  const score = typeof parsed.score === 'number' ? parsed.score : null
  const verdict = deriveVerdict({ score, dimensionScores, issues }, threshold)

  return {
    sceneId: fixture.sceneId,
    fixtureName: fixtureName.replace(/\.json$/, ''),
    categoryType: fixture.categoryType,
    model,
    promptHash,
    dimensionNames,
    threshold,
    score,
    pass: verdict.pass,
    verdictReason: verdict.reason,
    /** What the model claimed, kept so drift between the two stays visible. */
    selfReportedPass: typeof parsed.pass === 'boolean' ? parsed.pass : null,
    dimensionScores,
    issues,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    raw: parsed
  }
}

/**
 * Assembles the `{ meta, scenes }` baseline that `runRegressionCheck` expects
 * from the stored snapshots of the given fixtures.
 */
export function buildBaseline(fixtureNames) {
  const scenes = []
  const missing = []

  for (const name of fixtureNames) {
    if (!hasSnapshot(name)) {
      missing.push(name)
      continue
    }
    const snapshot = loadSnapshot(name)
    scenes.push({
      sceneId: snapshot.sceneId || snapshot.fixtureName?.replace(/\.json$/, '') || name,
      dimensionScores: snapshot.result?.dimensionScores || {},
      score: snapshot.result?.score ?? null,
      threshold: snapshot.threshold ?? null
    })
  }

  return {
    baseline: {
      meta: {
        generatedAt: null,
        workspaceType: 'creative',
        description: `Snapshot baseline from ${CORPUS_DIR}`
      },
      scenes
    },
    missing
  }
}

export function takeSnapshot(fixtureName) {
  const fixture = readFixture(fixtureName)
  const { systemPrompt, userPrompt, promptHash, dimensionNames, hasFewCharacters, threshold } = buildPrompt(fixture)

  return callAI(systemPrompt, userPrompt).then(({ parsed, model }) => {
    if (!existsSync(SNAPSHOT_DIR)) {
      mkdirSync(SNAPSHOT_DIR, { recursive: true })
    }

    const verdict = deriveVerdict(
      {
        score: typeof parsed.score === 'number' ? parsed.score : null,
        dimensionScores: parsed.dimensionScores || {},
        issues: Array.isArray(parsed.issues) ? parsed.issues : []
      },
      threshold
    )

    const snapshot = {
      $schema: 'critic-snapshot-1',
      takenAt: new Date().toISOString(),
      fixtureName,
      // Regression comparison keys scenes by this; older snapshots without it
      // fall back to the fixture name in `buildBaseline`.
      sceneId: fixture.sceneId,
      categoryType: fixture.categoryType || 'creative',
      model,
      promptHash,
      systemPrompt,
      userPrompt,
      dimensionNames,
      threshold,
      hasFewCharacters,
      // `result: parsed` recorded the model's raw JSON, including its own
      // `pass` boolean — so the critic's regression baseline was the critic
      // marking its own homework, and it duly passed a fixture declared
      // `expected: "fail"`. The verdict is now derived from the dimension
      // scores by the same function the app uses.
      result: {
        ...parsed,
        pass: verdict.pass,
        verdictReason: verdict.reason,
        /** What the model claimed, kept so drift between the two stays visible. */
        selfReportedPass: typeof parsed.pass === 'boolean' ? parsed.pass : null
      }
    }

    const path = snapshotPath(fixtureName)
    writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n')
    return snapshot
  })
}

export function checkSnapshot(fixtureName) {
  const fixture = readFixture(fixtureName)
  const { promptHash, systemPrompt, userPrompt, dimensionNames, hasFewCharacters, threshold } = buildPrompt(fixture)

  const path = snapshotPath(fixtureName)
  if (!existsSync(path)) {
    return { pass: false, errors: [`No snapshot found at ${path}. Run --take first.`] }
  }

  const snapshot = JSON.parse(readFileSync(path, 'utf-8'))
  const errors = []
  const warnings = []

  if (snapshot.$schema !== 'critic-snapshot-1') {
    errors.push(`Unknown schema: ${snapshot.$schema}`)
  }

  if (snapshot.promptHash !== promptHash) {
    errors.push(`PROMPT MISMATCH: snapshot hash ${snapshot.promptHash} differs from current ${promptHash}. The prompt construction has changed. Run --take again.`)
  }

  const currentModel =
    resolveSnapshotProvider() === 'ollama'
      ? `ollama/${process.env.SNAPSHOT_MODEL || 'qwen3:8b'}`
      : process.env.SNAPSHOT_MODEL || 'gpt-4o-mini'
  if (snapshot.model !== currentModel) {
    warnings.push(`MODEL DIFFERS: snapshot was taken with ${snapshot.model}, current config uses ${currentModel}. Outputs may vary.`)
  }

  if (snapshot.categoryType !== (fixture.categoryType || 'creative')) {
    warnings.push(`CATEGORY TYPE DIFFERS: snapshot has ${snapshot.categoryType}, fixture has ${fixture.categoryType}.`)
  }

  const r = snapshot.result || {}
  const meta = fixture._meta || {}

  if (typeof r.score !== 'number') {
    errors.push('Result is missing "score" field or score is not a number.')
  } else {
    if (typeof meta.minScore === 'number' && r.score < meta.minScore) {
      warnings.push(`Score ${r.score} is below expected minimum ${meta.minScore}.`)
    }
    if (typeof meta.maxScore === 'number' && r.score > meta.maxScore) {
      warnings.push(`Score ${r.score} is above expected maximum ${meta.maxScore}.`)
    }
  }

  if (typeof r.pass !== 'boolean') {
    errors.push('Result is missing "pass" field or pass is not a boolean.')
  } else if (meta.expected) {
    const expectedPass = meta.expected === 'pass'
    if (r.pass !== expectedPass) {
      // An ERROR, not a warning. `_meta.expected` is the fixture's whole reason
      // for existing: `clear-fail` is a deliberately contradictory, tell-heavy
      // scene declared as `expected: "fail", maxScore: 4`. A critic that passes
      // it at 8/10 is not drifting — it is not discriminating, and the pipeline
      // gate built on it cannot reject anything. Warning-only meant the suite
      // reported "3 passed, 0 failed" while stating that exact contradiction
      // two lines above.
      errors.push(
        `PASS STATUS MISMATCH: snapshot says ${r.pass ? 'pass' : 'fail'}, _meta expects ${meta.expected}. The critic is not discriminating between good and bad prose.`
      )
    }
  }

  if (!r.dimensionScores || typeof r.dimensionScores !== 'object') {
    errors.push('Result is missing "dimensionScores" object.')
  } else {
    for (const dim of dimensionNames) {
      const val = r.dimensionScores[dim]
      if (typeof val !== 'number' || val < 1 || val > 10) {
        warnings.push(`Dimension "${dim}" has out-of-range score: ${val}. Expected 1-10.`)
      }
    }
  }

  if (!Array.isArray(r.issues)) {
    errors.push('Result is missing "issues" array.')
  } else {
    for (const issue of r.issues) {
      if (!issue.type || !issue.description || !issue.severity) {
        warnings.push(`Issue missing required fields: ${JSON.stringify(issue)}`)
      }
    }
  }

  if (!Array.isArray(r.strengths)) {
    errors.push('Result is missing "strengths" array.')
  }

  return { pass: errors.length === 0, errors, warnings, snapshot }
}
