// Exports a fine-tuning dataset from eval history. Each record is
// { prompt: <scene prose>, completion: <critique: score/dimensionScores/issues/
// strengths> } — i.e. this trains a CRITIC (prose -> evaluation), not a
// generator. Output files are named accordingly (critic-training-data-*). To
// build a *generation* dataset you'd invert this: prompt = scene brief/context,
// completion = prose.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = resolve(__dirname, '..', '..', '..', 'reports')

function die(message) {
  console.error(`[export-training] ERROR: ${message}`)
  process.exit(1)
}

function log(...args) {
  console.log('[export-training]', ...args)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    source: null,
    content: null,
    topK: 100,
    // Fine-tuning wants a high bar. floor 5 admitted midpoint-quality and
    // judge-fallback (all-5) outputs into the "top" set; 8 keeps only strong
    // examples. Override with --floor if you deliberately want a wider set.
    floor: 8,
    format: 'jsonl',
    minEvalSamples: 3
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      flags.source = resolve(process.cwd(), args[++i])
    } else if (args[i] === '--content' && args[i + 1]) {
      flags.content = resolve(process.cwd(), args[++i])
    } else if (args[i] === '--top-k' && args[i + 1]) {
      flags.topK = parseInt(args[++i], 10)
    } else if (args[i] === '--floor' && args[i + 1]) {
      flags.floor = parseFloat(args[++i])
    } else if (args[i] === '--format' && args[i + 1]) {
      flags.format = args[++i]
    } else if (args[i] === '--min-samples' && args[i + 1]) {
      flags.minEvalSamples = parseInt(args[++i], 10)
    }
  }

  if (!flags.source) die('--source <path> is required (path to exported eval JSON with content)')
  return flags
}

function loadData(flags) {
  if (!existsSync(flags.source)) die(`File not found: ${flags.source}`)
  const data = JSON.parse(readFileSync(flags.source, 'utf-8'))
  if (!Array.isArray(data.evals)) die('JSON must have an "evals" array')
  let contentLookup = data.content || null

  if (flags.content) {
    const path = resolve(process.cwd(), flags.content)
    if (!existsSync(path)) die(`Content file not found: ${path}`)
    contentLookup = JSON.parse(readFileSync(path, 'utf-8'))
  }

  return { evals: data.evals, contentLookup }
}

function computeOverallScore(evalRecord) {
  if (typeof evalRecord.score === 'number') return evalRecord.score
  const ds = evalRecord.dimensionScores || {}
  const vals = Object.values(ds).filter((v) => typeof v === 'number')
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function buildTrainingExamples(evals, contentLookup, flags) {
  const candidates = evals.filter((e) => {
    const score = computeOverallScore(e)
    return score !== null && score >= flags.floor
  })

  // Sort by the same score the filter used (computeOverallScore), not raw
  // e.score — a record that passes on its dimension-score average but has no
  // top-level .score would otherwise sort to 0 and get truncated by --top-k.
  candidates.sort((a, b) => (computeOverallScore(b) ?? 0) - (computeOverallScore(a) ?? 0))
  const selected = candidates.slice(0, flags.topK)

  const examples = []
  for (const evalRec of selected) {
    const prose = contentLookup?.[evalRec.sceneId]
    if (!prose) continue

    const completion = {
      score: evalRec.score,
      dimensionScores: evalRec.dimensionScores || {},
      issues: evalRec.issues || [],
      strengths: evalRec.strengths || []
    }

    examples.push({
      workspaceType: evalRec.workspaceType || 'unknown',
      prompt: prose,
      completion,
      evalId: `${evalRec.projectId}:${evalRec.sceneId}:${evalRec.evalType}`
    })
  }

  return examples
}

function groupByWorkspace(examples) {
  const groups = {}
  for (const ex of examples) {
    if (!groups[ex.workspaceType]) groups[ex.workspaceType] = []
    groups[ex.workspaceType].push({
      prompt: ex.prompt,
      completion: ex.completion,
      evalId: ex.evalId
    })
  }
  return groups
}

function writeJsonl(groups, flags) {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })

  for (const [wt, examples] of Object.entries(groups)) {
    const filename = `critic-training-data-${wt}.jsonl`
    const filepath = resolve(REPORTS_DIR, filename)
    const lines = examples.map((ex) =>
      JSON.stringify({ prompt: ex.prompt, completion: ex.completion })
    )
    writeFileSync(filepath, lines.join('\n') + '\n', 'utf-8')
    log(`Wrote ${examples.length} examples → ${filename}`)
  }

  const all = Object.values(groups).flat()
  log(`Total training examples: ${all.length}`)
  return all
}

function writeJson(groups, flags) {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })

  const all = {}
  for (const [wt, examples] of Object.entries(groups)) {
    all[wt] = examples
  }

  const filepath = resolve(REPORTS_DIR, 'critic-training-data.json')
  writeFileSync(filepath, JSON.stringify(all, null, 2), 'utf-8')
  log(
    `Wrote critic training data → critic-training-data.json (${Object.values(all).flat().length} examples)`
  )
  return Object.values(all).flat()
}

async function main() {
  const flags = parseArgs()
  const { evals, contentLookup } = loadData(flags)

  log(`Loaded ${evals.length} eval records`)
  log(
    `Content available: ${contentLookup ? Object.keys(contentLookup).length + ' entries' : 'none'}`
  )

  const examples = buildTrainingExamples(evals, contentLookup, flags)
  const groups = groupByWorkspace(examples)

  // Enforce the per-workspace minimum sample count. This flag was parsed and
  // documented but never applied — a workspace with a single passing example
  // would still export, which is too sparse to fine-tune on.
  for (const wt of Object.keys(groups)) {
    if (groups[wt].length < flags.minEvalSamples) {
      log(
        `Dropping workspace "${wt}": ${groups[wt].length} < --min-samples ${flags.minEvalSamples}`
      )
      delete groups[wt]
    }
  }

  log(`Workspaces with training data: ${Object.keys(groups).join(', ') || 'none'}`)
  for (const [wt, exs] of Object.entries(groups)) {
    log(`  ${wt}: ${exs.length} examples`)
  }

  if (flags.format === 'jsonl') {
    writeJsonl(groups, flags)
  } else {
    writeJson(groups, flags)
  }

  const totalWritten = Object.values(groups).flat().length
  const reportPath = resolve(REPORTS_DIR, 'critic-training-export-summary.json')
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        datasetType: 'critic', // prose -> critique; see file header
        source: flags.source,
        config: {
          topK: flags.topK,
          floor: flags.floor,
          minSamples: flags.minEvalSamples,
          format: flags.format
        },
        totalEvalRecords: evals.length,
        totalTrainingExamples: totalWritten,
        workspaceTypes: Object.keys(groups)
      },
      null,
      2
    ),
    'utf-8'
  )
  log(`Summary → critic-training-export-summary.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
