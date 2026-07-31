import {
  takeSnapshot,
  checkSnapshot,
  readFixture,
  buildPrompt,
  runCritic,
  buildBaseline,
  hasSnapshot,
  listFixtureNames,
  getCorpusDir
} from './libs/criticSnapshot.mjs'
import { decideRegression } from './libs/regressionDecision.mjs'

function usage() {
  console.log(`Usage:
  Baseline
    --take <fixture>       Run the critic on a fixture and save its snapshot
    --take-all             Take snapshots for every fixture in the corpus
    --update <fixture>     Alias for --take (overwrites an existing snapshot)

  Regression check (calls the AI — needs OPENAI_API_KEY)
    --check <fixture>      Re-run the critic and compare against the stored snapshot
    --check-all            Same, for every fixture that has a snapshot

  Offline validation (no API key needed)
    --validate <fixture>   Verify the stored snapshot is still current and well-formed
    --validate-all         Same, for every fixture
    --show-prompt <fixture>  Print the prompt that would be sent

Exit codes:
  0  no regressions / all valid
  1  a dimension regressed, a score fell below threshold, or validation failed

Environment:
  OPENAI_API_KEY     Required for --take and --check
  SNAPSHOT_MODEL     Model to use (default: gpt-4o-mini)
  EVAL_CORPUS_DIR    Corpus directory (default: corpus/)
                     e.g. src/tests/fixtures/eval-corpus
  REGRESSION_FAIL_ON_MINOR  Set to "1" to fail on minor regressions too

Examples:
  node tools/eval-snapshot.mjs --take-all
  node tools/eval-snapshot.mjs --check good-pass
  EVAL_CORPUS_DIR=src/tests/fixtures/eval-corpus node tools/eval-snapshot.mjs --check-all`)
}

/**
 * Re-runs the critic over `fixtures` and compares the results with the stored
 * snapshots. Two independent failure conditions, both required by the plan:
 *   1. a dimension regressed against the baseline (via regressionRunner)
 *   2. a fixture's overall score fell below its own pass threshold
 */
async function runRegression(fixtures) {
  const withSnapshots = fixtures.filter(hasSnapshot)
  const skipped = fixtures.filter((f) => !hasSnapshot(f))

  if (withSnapshots.length === 0) {
    console.error('No snapshots to compare against. Run --take-all first.')
    return 1
  }

  for (const name of skipped) {
    console.log(`  - ${name}: no snapshot, skipping`)
  }

  const current = []
  for (const name of withSnapshots) {
    process.stdout.write(`  running ${name}... `)
    try {
      const result = await runCritic(name)
      current.push(result)
      console.log(`${result.score}/10`)
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      return 1
    }
  }

  const { baseline } = buildBaseline(withSnapshots)
  const { ok, report, violations, belowThreshold } = decideRegression({
    current,
    baseline,
    failOnMinor: process.env.REGRESSION_FAIL_ON_MINOR === '1'
  })

  console.log('\n--- Regression report ---')
  console.log(`  Scenes compared:       ${report.summary.scenesCompared}`)
  console.log(`  Dimensions improved:   ${report.summary.dimensionsWithImprovement}`)
  console.log(`  Dimensions regressed:  ${report.summary.dimensionsWithRegression}`)
  console.log(`  Major regressions:     ${report.summary.dimensionsWithMajorRegression}`)

  for (const sr of report.sceneResults) {
    const marker = sr.status === 'regression' ? '✗' : sr.status === 'minor_degradation' ? '!' : '✓'
    console.log(`  ${marker} ${sr.sceneId} [${sr.status}]`)
    for (const dim of sr.summary?.majorRegressions ?? []) {
      const info = sr.degradation[dim]
      console.log(`      ${dim}: ${info.before} → ${info.after} (${info.delta})`)
    }
  }

  for (const r of belowThreshold) {
    console.log(`  ✗ ${r.sceneId}: score ${r.score} is below threshold ${r.threshold}`)
  }

  if (ok) {
    console.log('\n✓ No regressions detected.')
    return 0
  }

  console.log(
    `\n✗ ${violations.length} regression violation(s), ${belowThreshold.length} threshold breach(es).`
  )
  return 1
}

function runValidation(fixtures) {
  let ok = 0
  let fail = 0
  let skipped = 0

  for (const name of fixtures) {
    // A fixture with no snapshot has nothing to validate — that is not a
    // failure. `checkSnapshot` reports it as an error, so filter it here.
    if (!hasSnapshot(name)) {
      console.log(`  - ${name}: no snapshot (skipping)`)
      skipped++
      continue
    }

    try {
      const result = checkSnapshot(name)
      if (result.pass) {
        console.log(`  ✓ ${name}`)
        ok++
      } else {
        console.log(`  ✗ ${name}`)
        for (const e of result.errors) console.log(`      ${e}`)
        fail++
      }
      for (const w of result.warnings ?? []) console.log(`      WARNING: ${w}`)
    } catch (err) {
      console.log(`  ✗ ${name}: ${err.message}`)
      fail++
    }
  }

  console.log(`\nDone. ${ok} passed, ${fail} failed, ${skipped} skipped.`)
  return fail > 0 ? 1 : 0
}

async function takeOne(name) {
  const snapshot = await takeSnapshot(name)
  const passLabel = snapshot.result.pass ? 'PASS' : 'FAIL'
  console.log(`\nSnapshot saved: ${snapshot.fixtureName}`)
  console.log(`  Model:       ${snapshot.model}`)
  console.log(`  Type:        ${snapshot.categoryType}`)
  console.log(`  Score:       ${snapshot.result.score}/10 (${passLabel})`)
  console.log(`  Issues:      ${(snapshot.result.issues || []).length}`)
  console.log(`  Strengths:   ${(snapshot.result.strengths || []).length}`)
  console.log(`  Prompt hash: ${snapshot.promptHash.slice(0, 12)}...`)
}

function requireTarget(target, mode) {
  if (!target) {
    console.error(`Error: ${mode} requires a fixture name.`)
    console.error(`Example: node tools/eval-snapshot.mjs ${mode} good-pass`)
    process.exit(1)
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    usage()
    process.exit(0)
  }

  const mode = args[0]
  const target = args[1]

  switch (mode) {
    case '--take':
    case '--update': {
      requireTarget(target, '--take')
      console.log(`Taking snapshot for "${target}"...`)
      try {
        await takeOne(target)
      } catch (err) {
        console.error(`\nError taking snapshot: ${err.message}`)
        process.exit(1)
      }
      break
    }

    case '--take-all': {
      const fixtures = listFixtureNames()
      console.log(`Taking snapshots for ${fixtures.length} fixtures in ${getCorpusDir()}...\n`)
      let ok = 0
      let fail = 0
      for (const f of fixtures) {
        try {
          const snapshot = await takeSnapshot(f)
          const passLabel = snapshot.result.pass ? 'PASS' : 'FAIL'
          console.log(`  ✓ ${f}: ${snapshot.result.score}/10 (${passLabel}) [${snapshot.model}]`)
          ok++
        } catch (err) {
          console.log(`  ✗ ${f}: ${err.message}`)
          fail++
        }
      }
      console.log(`\nDone. ${ok} succeeded, ${fail} failed.`)
      if (fail > 0) process.exit(1)
      break
    }

    case '--check': {
      requireTarget(target, '--check')
      console.log(`Regression check for "${target}"...\n`)
      process.exit(await runRegression([target.replace(/\.json$/, '')]))
      break
    }

    case '--check-all': {
      const fixtures = listFixtureNames()
      console.log(`Regression check for ${fixtures.length} fixtures in ${getCorpusDir()}...\n`)
      process.exit(await runRegression(fixtures))
      break
    }

    case '--validate': {
      requireTarget(target, '--validate')
      console.log(`Validating snapshot for "${target}"...\n`)
      process.exit(runValidation([target.replace(/\.json$/, '')]))
      break
    }

    case '--validate-all': {
      const fixtures = listFixtureNames()
      console.log(`Validating ${fixtures.length} snapshots in ${getCorpusDir()}...\n`)
      process.exit(runValidation(fixtures))
      break
    }

    case '--show-prompt': {
      requireTarget(target, '--show-prompt')
      try {
        const fixture = readFixture(target)
        const { systemPrompt, userPrompt, dimensionNames, threshold, hasFewCharacters } =
          buildPrompt(fixture)
        console.log('=== SYSTEM PROMPT ===')
        console.log(systemPrompt)
        console.log('\n=== USER PROMPT ===')
        console.log(userPrompt)
        console.log('\n=== METADATA ===')
        console.log(`  Dimensions:    ${dimensionNames.join(', ')}`)
        console.log(`  Threshold:     ${threshold}`)
        console.log(`  Few chars:     ${hasFewCharacters}`)
      } catch (err) {
        console.error(`Error: ${err.message}`)
        process.exit(1)
      }
      break
    }

    case '--help':
    case '-h':
      usage()
      break

    default:
      console.error(`Unknown mode: ${mode}`)
      usage()
      process.exit(1)
  }
}

main()
