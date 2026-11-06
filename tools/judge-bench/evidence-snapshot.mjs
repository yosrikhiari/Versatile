#!/usr/bin/env node
/**
 * Evidence snapshot CLI.
 *
 *   npx vite-node tools/judge-bench/evidence-snapshot.mjs --write
 *   npx vite-node tools/judge-bench/evidence-snapshot.mjs --check
 *
 * The snapshot freezes the gate/prompt source hashes and the curated evidence
 * register (corpora, model defaults, active/superseded/retracted claims) in
 * `tools/judge-bench/evidence-snapshot.json`. `--check` fails when a gate or
 * prompt source changed without regenerating the snapshot, or when the register
 * changed without a new snapshot.
 *
 * This is not a model run and does not read the reviewer corpus. It records
 * what the repository currently claims, with the code identity needed to tell
 * whether those claims still describe the same gate.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildEvidenceSnapshot,
  compareEvidenceSnapshot
} from '../../src/evaluation/evidenceSnapshot'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const REGISTER = join(__dirname, 'evidence-register.json')
const SNAPSHOT = join(__dirname, 'evidence-snapshot.json')

// Whole-file hashes are deliberately conservative: a changed threshold, schema
// or instruction changes the hash even when the prompt text is unchanged.
const GATE_SOURCES = [
  'src/composables/generation/writing/sceneGate.ts',
  'src/composables/useStoryCritic.ts',
  'src/composables/criticIsolation.ts',
  'src/services/criticVerdict.ts',
  'src/config/evalDimensions.ts',
  'src/config/evalGateConfig.ts',
  'src/config/roles.ts',
  'src/config/ollama.ts'
]

const PROMPT_SOURCES = [
  'src/composables/criticIsolation.ts',
  'src/composables/useStoryCritic.ts',
  'src/composables/useStoryEditor.ts',
  'src/config/evalDimensions.ts'
]

function usage() {
  console.log(`Usage:
  --write    Regenerate tools/judge-bench/evidence-snapshot.json
  --check    Verify the committed snapshot matches the current gate/prompts/register
  --json     Print the generated snapshot instead of writing it
  --help     Show this message

Run through vite-node, e.g.:
  npx vite-node tools/judge-bench/evidence-snapshot.mjs --check`)
}

function readText(relativePath) {
  const absolute = join(ROOT, relativePath)
  if (!existsSync(absolute)) {
    throw new Error(`evidence source is missing: ${relativePath}`)
  }
  return readFileSync(absolute, 'utf8')
}

function sourceList(paths) {
  return paths.map((path) => ({ path, content: readText(path) }))
}

function readRegister() {
  if (!existsSync(REGISTER)) {
    throw new Error(`evidence register is missing: ${REGISTER}`)
  }
  return JSON.parse(readFileSync(REGISTER, 'utf8'))
}

function gitInfo() {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8'
    }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: ROOT,
      encoding: 'utf8'
    }).trim().length > 0
    return head ? { head, dirty } : null
  } catch {
    return null
  }
}

function currentSnapshot() {
  return buildEvidenceSnapshot({
    generatedAt: new Date().toISOString(),
    git: gitInfo(),
    sources: sourceList(GATE_SOURCES),
    promptSources: sourceList(PROMPT_SOURCES),
    register: readRegister()
  })
}

function statusCounts(claims) {
  const counts = {}
  for (const claim of claims) counts[claim.status] = (counts[claim.status] || 0) + 1
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `${status}=${count}`)
    .join(', ')
}

function printSummary(snapshot) {
  const { register } = snapshot
  console.log(`Gate:      ${register.gate.version}`)
  console.log(`Load-bearing: ${register.gate.loadBearingDimensions.join(', ')}`)
  console.log(`Advisory:  ${register.gate.advisoryDimensions.join(', ') || '(none)'}`)
  console.log(`Models:    ${Object.entries(register.models).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  console.log(`Corpora:   ${register.corpora.map((c) => `${c.id} (${c.count ?? '?'} ${c.units})`).join(', ')}`)
  console.log(`Claims:    ${statusCounts(register.claims)}`)
  console.log(`Gate hash: ${snapshot.fingerprints.gate.combined}`)
  console.log(`Prompt:    ${snapshot.fingerprints.prompts.combined}`)
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.length === 0) {
    usage()
    return 0
  }

  if (args.includes('--check')) {
    if (!existsSync(SNAPSHOT)) {
      console.error('Missing evidence snapshot. Run --write first.')
      return 1
    }
    const committed = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
    const current = currentSnapshot()
    const drift = compareEvidenceSnapshot(committed, current)
    if (drift.length === 0) {
      console.log('OK: evidence snapshot matches the current gate, prompts and register.')
      printSummary(current)
      return 0
    }
    console.error(`Evidence snapshot is stale (${drift.length} difference(s)):`)
    for (const item of drift) {
      console.error(`  ${item.path}`)
      console.error(`    committed: ${item.expected}`)
      console.error(`    current:   ${item.actual}`)
    }
    console.error('\nRegenerate with: npx vite-node tools/judge-bench/evidence-snapshot.mjs --write')
    return 1
  }

  const snapshot = currentSnapshot()
  if (args.includes('--json')) {
    console.log(JSON.stringify(snapshot, null, 2))
    return 0
  }

  if (args.includes('--write')) {
    writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`Wrote ${SNAPSHOT}`)
    printSummary(snapshot)
    return 0
  }

  usage()
  return 1
}

process.exitCode = main()
