import { db } from './db-core'

/**
 * Compiled-output "edition" records (local-only, schema v60).
 *
 * Inspired by Open Library's edition concept: each export/compile is a specific
 * manifestation of the manuscript. We store metadata only (no file blob) and
 * keep this table out of SYNC_ENTITIES.
 */

type ProjectId = number | string

export type CompileEditionFormat = 'markdown' | 'docx' | 'epub' | 'pdf' | 'rtf' | string

export interface CompileEditionRecord {
  id?: number
  projectId: ProjectId
  format: CompileEditionFormat
  title: string
  filename: string
  workflow: Record<string, unknown>
  stats: Record<string, unknown>
  createdAt: string
}

export async function recordCompileEdition(
  entry: Omit<CompileEditionRecord, 'id' | 'createdAt'> & { createdAt?: string }
): Promise<number | null> {
  if (entry?.projectId == null) return null
  const record: CompileEditionRecord = {
    projectId: entry.projectId,
    format: entry.format || 'unknown',
    title: entry.title || 'Manuscript',
    filename: entry.filename || '',
    workflow: entry.workflow && typeof entry.workflow === 'object' ? entry.workflow : {},
    stats: entry.stats && typeof entry.stats === 'object' ? entry.stats : {},
    createdAt: entry.createdAt || new Date().toISOString()
  }
  return (await db.compileEditions.add(record)) as number
}

export async function listCompileEditions(
  projectId: ProjectId | null | undefined
): Promise<CompileEditionRecord[]> {
  if (projectId == null) return []
  const rows = (await db.compileEditions
    .where('projectId')
    .equals(projectId)
    .reverse()
    .sortBy('createdAt')) as CompileEditionRecord[]
  return rows
}
