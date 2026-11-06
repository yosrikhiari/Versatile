/**
 * Evidence snapshot: the frozen identity of the judge and the claims it is
 * allowed to support.
 *
 * The domain report's critical review asked for one artifact that answers
 * "which gate, which config, which labels, and which old numbers are still
 * current?" without re-reading a 500-line report. This module is the pure part:
 * validation, deterministic fingerprints and drift comparison. The CLI in
 * `tools/judge-bench/evidence-snapshot.mjs` supplies files and git metadata and
 * writes `tools/judge-bench/evidence-snapshot.json`.
 *
 * Hashing whole files is deliberate. A hash of an extracted prompt string would
 * miss a changed schema, threshold or surrounding instruction; a whole-file
 * hash changes whenever any of those change. The source list names which files
 * are considered part of the gate, so the hash is auditable rather than magic.
 */
import { sha256Hex } from './labelDerivation'

export const EVIDENCE_SNAPSHOT_KIND = 'versatile-evidence-snapshot'
export const EVIDENCE_SNAPSHOT_SCHEMA_VERSION = 1

export type EvidenceStatus =
  'active' | 'historical' | 'superseded' | 'retracted' | 'exploratory' | 'invalid' | 'blocked'

export type LabelSource =
  | 'human'
  | 'claude-reviewer'
  | 'model-generated'
  | 'planted'
  | 'structured'
  | 'none'
  | 'mixed'
  | 'unknown'

export type CorpusStatus = 'active' | 'pending' | 'incomplete' | 'historical' | 'superseded'

export interface EvidenceClaim {
  id: string
  statement: string
  value?: string | number | boolean | null
  source: string
  date?: string
  status: EvidenceStatus
  labelSource: LabelSource
  supersededBy?: string
  note?: string
}

export interface EvidenceCorpus {
  id: string
  description: string
  units: string
  count: number | null
  source: string
  labelSource: LabelSource
  status: CorpusStatus
  note?: string
}

/**
 * A script that looks like an evaluation but must never be cited as evidence.
 * Keeping the entry machine-readable lets `evidence:check` freeze the warning
 * alongside the claims, instead of relying on a comment in the script header.
 */
export interface NonEvidenceScript {
  id: string
  script: string
  command: string
  reason: string
  replacement: string | null
}

export interface EvidenceGateConfig {
  version: string
  loadBearingDimensions: string[]
  advisoryDimensions: string[]
  minDimensionScore: number
  maxMajorIssues: number
  enforceMean: boolean
  focusedCriticDefault?: boolean
  judgeSampling?: { repeatPenalty: number }
}

export interface EvidenceRegister {
  schemaVersion: number
  asOf: string
  gate: EvidenceGateConfig
  models: Record<string, string>
  corpora: EvidenceCorpus[]
  claims: EvidenceClaim[]
  nonEvidence?: NonEvidenceScript[]
}

export interface EvidenceSource {
  path: string
  content: string
}

export interface EvidenceFingerprint {
  sources: Record<string, string>
  combined: string
}

export interface EvidenceSnapshot {
  schemaVersion: number
  kind: string
  generatedAt: string
  git: { head: string; dirty: boolean } | null
  fingerprints: {
    gate: EvidenceFingerprint
    prompts: EvidenceFingerprint
  }
  register: EvidenceRegister
}

export interface SnapshotDrift {
  path: string
  expected: string
  actual: string
}

export interface ConsensusAssessment {
  status: 'ready' | 'blocked'
  total: number
  withPassA: number
  withPassB: number
  mergedOnly: number
  reason: string
}

const EVIDENCE_STATUSES: readonly EvidenceStatus[] = [
  'active',
  'historical',
  'superseded',
  'retracted',
  'exploratory',
  'invalid',
  'blocked'
]

const LABEL_SOURCES: readonly LabelSource[] = [
  'human',
  'claude-reviewer',
  'model-generated',
  'planted',
  'structured',
  'none',
  'mixed',
  'unknown'
]

const CORPUS_STATUSES: readonly CorpusStatus[] = [
  'active',
  'pending',
  'incomplete',
  'historical',
  'superseded'
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0)
  )
}

/** Returns every structural problem found; an empty array means valid. */
export function validateEvidenceRegister(input: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(input)) return ['register must be an object']

  if (input.schemaVersion !== EVIDENCE_SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${EVIDENCE_SNAPSHOT_SCHEMA_VERSION}`)
  }
  if (!isDate(input.asOf)) errors.push('asOf must be YYYY-MM-DD')

  if (!isRecord(input.gate)) {
    errors.push('gate must be an object')
  } else {
    if (!isNonEmptyString(input.gate.version)) errors.push('gate.version is required')
    if (!isStringArray(input.gate.loadBearingDimensions)) {
      errors.push('gate.loadBearingDimensions must be a non-empty string array')
    }
    if (!Array.isArray(input.gate.advisoryDimensions)) {
      errors.push('gate.advisoryDimensions must be an array')
    }
    for (const field of ['minDimensionScore', 'maxMajorIssues'] as const) {
      if (typeof input.gate[field] !== 'number' || !Number.isFinite(input.gate[field])) {
        errors.push(`gate.${field} must be a finite number`)
      }
    }
    if (typeof input.gate.enforceMean !== 'boolean') {
      errors.push('gate.enforceMean must be a boolean')
    }
  }

  if (!isRecord(input.models) || Object.keys(input.models).length === 0) {
    errors.push('models must be a non-empty object')
  }

  const corpusIds = new Set<string>()
  if (!Array.isArray(input.corpora)) {
    errors.push('corpora must be an array')
  } else {
    input.corpora.forEach((corpus, index) => {
      if (!isRecord(corpus)) {
        errors.push(`corpora[${index}] must be an object`)
        return
      }
      if (!isNonEmptyString(corpus.id)) errors.push(`corpora[${index}].id is required`)
      else if (corpusIds.has(corpus.id)) errors.push(`duplicate corpus id: ${corpus.id}`)
      else corpusIds.add(corpus.id)
      if (!isNonEmptyString(corpus.description)) {
        errors.push(`corpora[${index}].description is required`)
      }
      if (!isNonEmptyString(corpus.units)) errors.push(`corpora[${index}].units is required`)
      if (corpus.count !== null && (typeof corpus.count !== 'number' || corpus.count < 0)) {
        errors.push(`corpora[${index}].count must be a non-negative number or null`)
      }
      if (!isNonEmptyString(corpus.source)) errors.push(`corpora[${index}].source is required`)
      if (!LABEL_SOURCES.includes(corpus.labelSource as LabelSource)) {
        errors.push(`corpora[${index}].labelSource is invalid`)
      }
      if (!CORPUS_STATUSES.includes(corpus.status as CorpusStatus)) {
        errors.push(`corpora[${index}].status is invalid`)
      }
    })
  }

  const claimIds = new Set<string>()
  if (!Array.isArray(input.claims) || input.claims.length === 0) {
    errors.push('claims must be a non-empty array')
  } else {
    input.claims.forEach((claim, index) => {
      if (!isRecord(claim)) {
        errors.push(`claims[${index}] must be an object`)
        return
      }
      if (!isNonEmptyString(claim.id)) {
        errors.push(`claims[${index}].id is required`)
      } else if (!/^[a-z0-9][a-z0-9-]*$/.test(claim.id)) {
        errors.push(`claims[${index}].id must be lowercase kebab-case`)
      } else if (claimIds.has(claim.id)) {
        errors.push(`duplicate claim id: ${claim.id}`)
      } else {
        claimIds.add(claim.id)
      }
      if (!isNonEmptyString(claim.statement)) {
        errors.push(`claims[${index}].statement is required`)
      }
      if (!isNonEmptyString(claim.source)) errors.push(`claims[${index}].source is required`)
      if (claim.date !== undefined && !isDate(claim.date)) {
        errors.push(`claims[${index}].date must be YYYY-MM-DD`)
      }
      if (!EVIDENCE_STATUSES.includes(claim.status as EvidenceStatus)) {
        errors.push(`claims[${index}].status is invalid`)
      }
      if (!LABEL_SOURCES.includes(claim.labelSource as LabelSource)) {
        errors.push(`claims[${index}].labelSource is invalid`)
      }
      if (claim.value !== undefined) {
        const kind = typeof claim.value
        if (!['string', 'number', 'boolean'].includes(kind) && claim.value !== null) {
          errors.push(`claims[${index}].value must be a string, number, boolean or null`)
        }
      }
      if (claim.status === 'superseded' && !isNonEmptyString(claim.supersededBy)) {
        errors.push(`claims[${index}] is superseded but has no supersededBy`)
      }
      if (claim.supersededBy !== undefined) {
        if (!isNonEmptyString(claim.supersededBy)) {
          errors.push(`claims[${index}].supersededBy must be a claim id`)
        } else if (claim.supersededBy === claim.id) {
          errors.push(`claims[${index}] cannot supersede itself`)
        }
      }
      if (claim.status === 'retracted' && !isNonEmptyString(claim.note)) {
        errors.push(`claims[${index}] is retracted but has no note`)
      }
    })

    for (const claim of input.claims) {
      if (
        isRecord(claim) &&
        isNonEmptyString(claim.supersededBy) &&
        !claimIds.has(claim.supersededBy)
      ) {
        errors.push(
          `claims.${claim.id}: supersededBy references unknown claim ${claim.supersededBy}`
        )
      }
    }
  }

  const nonEvidenceIds = new Set<string>()
  if (input.nonEvidence !== undefined) {
    if (!Array.isArray(input.nonEvidence)) {
      errors.push('nonEvidence must be an array')
    } else {
      input.nonEvidence.forEach((entry, index) => {
        if (!isRecord(entry)) {
          errors.push(`nonEvidence[${index}] must be an object`)
          return
        }
        if (!isNonEmptyString(entry.id)) {
          errors.push(`nonEvidence[${index}].id is required`)
        } else if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) {
          errors.push(`nonEvidence[${index}].id must be lowercase kebab-case`)
        } else if (nonEvidenceIds.has(entry.id)) {
          errors.push(`duplicate nonEvidence id: ${entry.id}`)
        } else {
          nonEvidenceIds.add(entry.id)
        }
        if (!isNonEmptyString(entry.script)) errors.push(`nonEvidence[${index}].script is required`)
        if (!isNonEmptyString(entry.command)) {
          errors.push(`nonEvidence[${index}].command is required`)
        }
        if (!isNonEmptyString(entry.reason)) errors.push(`nonEvidence[${index}].reason is required`)
        if (entry.replacement !== null && !isNonEmptyString(entry.replacement)) {
          errors.push(`nonEvidence[${index}].replacement must be a path or null`)
        }
      })
    }
  }

  return errors
}

/** Hashes each source independently and the ordered list as one fingerprint. */
export function fingerprintSources(sources: EvidenceSource[]): EvidenceFingerprint {
  const hashes: Record<string, string> = {}
  for (const source of sources) {
    if (hashes[source.path] !== undefined) {
      throw new Error(`duplicate evidence source path: ${source.path}`)
    }
    // Text checkouts differ only by line ending on Windows; that is not a
    // gate change. Normalize before hashing so a snapshot taken here is
    // verifiable on a Linux CI checkout.
    const normalized = source.content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    hashes[source.path] = sha256Hex(normalized)
  }
  const combined = sha256Hex(
    Object.entries(hashes)
      .map(([path, hash]) => `${path}\0${hash}`)
      .join('\n')
  )
  return { sources: hashes, combined }
}

export function buildEvidenceSnapshot(input: {
  generatedAt: string
  git: { head: string; dirty: boolean } | null
  sources: EvidenceSource[]
  promptSources: EvidenceSource[]
  register: EvidenceRegister
}): EvidenceSnapshot {
  const errors = validateEvidenceRegister(input.register)
  if (errors.length > 0) {
    throw new Error(`invalid evidence register:\n${errors.join('\n')}`)
  }
  if (!input.sources.length) throw new Error('at least one gate source is required')
  if (!input.promptSources.length) throw new Error('at least one prompt source is required')

  return {
    schemaVersion: EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
    kind: EVIDENCE_SNAPSHOT_KIND,
    generatedAt: input.generatedAt,
    git: input.git,
    fingerprints: {
      gate: fingerprintSources(input.sources),
      prompts: fingerprintSources(input.promptSources)
    },
    register: input.register
  }
}

function fingerprintDrift(
  label: string,
  expected: EvidenceFingerprint,
  actual: EvidenceFingerprint
): SnapshotDrift[] {
  const drift: SnapshotDrift[] = []
  const paths = new Set([...Object.keys(expected.sources), ...Object.keys(actual.sources)])
  for (const path of [...paths].sort()) {
    if (expected.sources[path] !== actual.sources[path]) {
      drift.push({
        path: `${label}.${path}`,
        expected: expected.sources[path] ?? '(missing)',
        actual: actual.sources[path] ?? '(missing)'
      })
    }
  }
  if (expected.combined !== actual.combined) {
    drift.push({ path: `${label}.combined`, expected: expected.combined, actual: actual.combined })
  }
  return drift
}

/**
 * Compares the frozen identity only. `generatedAt` and `git` change for every
 * run and are deliberately ignored; the register is compared because a claim
 * or corpus status changing is exactly what needs a fresh snapshot.
 */
export function compareEvidenceSnapshot(
  expected: EvidenceSnapshot,
  current: EvidenceSnapshot
): SnapshotDrift[] {
  const drift: SnapshotDrift[] = []
  if (expected.schemaVersion !== current.schemaVersion) {
    drift.push({
      path: 'schemaVersion',
      expected: String(expected.schemaVersion),
      actual: String(current.schemaVersion)
    })
  }
  drift.push(
    ...fingerprintDrift('fingerprints.gate', expected.fingerprints.gate, current.fingerprints.gate),
    ...fingerprintDrift(
      'fingerprints.prompts',
      expected.fingerprints.prompts,
      current.fingerprints.prompts
    )
  )
  if (JSON.stringify(expected.register) !== JSON.stringify(current.register)) {
    drift.push({
      path: 'register',
      expected: 'committed register',
      actual: 'register changed without regenerating the snapshot'
    })
  }
  return drift
}

export function assessConsensus(
  entries: Array<Record<string, unknown>> | null | undefined
): ConsensusAssessment {
  const list = Array.isArray(entries) ? entries : []
  let withPassA = 0
  let withPassB = 0
  let mergedOnly = 0
  for (const entry of list) {
    const passA = isRecord(entry) && isRecord(entry.passA)
    const passB = isRecord(entry) && isRecord(entry.passB)
    if (passA) withPassA++
    if (passB) withPassB++
    if (!passA && !passB && isRecord(entry) && ('dims' in entry || 'overall' in entry)) {
      mergedOnly++
    }
  }
  const complete = list.length > 0 && withPassA === list.length && withPassB === list.length
  if (complete) {
    return {
      status: 'ready',
      total: list.length,
      withPassA,
      withPassB,
      mergedOnly,
      reason: 'every entry carries separate passA and passB labels'
    }
  }
  let reason = 'no consensus entries found'
  if (list.length > 0) {
    reason =
      `calibration blocked: ${list.length - withPassA} entries lack passA and ` +
      `${list.length - withPassB} lack passB` +
      (mergedOnly > 0 ? `; ${mergedOnly} are merged-only and cannot stand in for two passes` : '')
  }
  return {
    status: 'blocked',
    total: list.length,
    withPassA,
    withPassB,
    mergedOnly,
    reason
  }
}
