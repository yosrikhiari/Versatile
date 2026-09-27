import type { Table } from 'dexie'
import { db as _db } from '../db-core'
import { createProject, updateProject } from '../db-projects'
import { ensureMainBranch } from '../db-branches'
import { DEFAULT_VOLUME_COLOR } from '../../config/volumeColors'
import { type ImportedBook, sceneHtml } from './structure'

type Row = Record<string, unknown>
const db = _db as unknown as {
  transaction: (mode: 'rw', ...rest: unknown[]) => Promise<void>
  volumes: Table<Row, number>
  sections: Table<Row, number>
  subsections: Table<Row, number>
}

export interface WrittenImport {
  projectId: string
  chapters: number
  scenes: number
  words: number
}

/**
 * Write an imported book as a new project (WHATIF-AND-IMPORT-PLAN.md gate G3):
 * the main branch first, then volumes (only when the book has named parts),
 * chapters and scenes in one transaction. Every row carries the main branch,
 * `order`, a 1-based book-wide `sceneNumber`, `wordCount` and HTML content,
 * the same fields a generated book has -- an imported book used to reach the
 * editor, if at all, as rows without a branch or a scene number, which every
 * branch-filtered read and every "scene N of the book" lookup then missed.
 *
 * Rows are bulk-written; nothing is embedded or indexed here. That is the
 * analysis pass's job (step 3), which runs once, in the background, with a
 * progress bar, instead of one embedding request per scene at once.
 */
export async function createProjectFromBook(
  book: ImportedBook,
  { name, ownerId = null }: { name?: string; ownerId?: string | null } = {}
): Promise<WrittenImport> {
  const title = (name || book.title || 'Imported book').trim()
  const projectId = await createProject(
    title,
    '',
    book.author ? `By ${book.author}` : '',
    ownerId,
    ''
  )
  const main = await ensureMainBranch(projectId)
  const now = new Date().toISOString()
  const named = book.parts.some((p) => p.title)

  let chapterOrder = 0
  let sceneNumber = 0
  let words = 0
  await db.transaction('rw', db.volumes, db.sections, db.subsections, async () => {
    for (const [pi, part] of book.parts.entries()) {
      const volumeId = named
        ? await db.volumes.add({
            projectId,
            title: part.title || `Part ${pi + 1}`,
            description: '',
            color: DEFAULT_VOLUME_COLOR,
            order: pi,
            sectionIds: [],
            createdAt: now,
            updatedAt: now
          })
        : null
      for (const chapter of part.chapters) {
        const chapterWords = chapter.scenes.reduce((n, s) => n + s.words, 0)
        const sectionId = await db.sections.add({
          projectId,
          branchId: main.id,
          title: chapter.title,
          summary: '',
          order: chapterOrder++,
          status: 'final',
          volumeId,
          // A chapter's own body: its words are in its scenes, and every
          // counter adds chapters and scenes together (the v52 double count).
          wordCount: 0,
          createdAt: now,
          updatedAt: now
        })
        await db.subsections.bulkAdd(
          chapter.scenes.map((scene, order) => ({
            projectId,
            branchId: main.id,
            sectionId,
            title: scene.title,
            order,
            sceneNumber: ++sceneNumber,
            type: 'scene',
            content: sceneHtml(scene),
            wordCount: scene.words,
            contentStatus: 'draft',
            createdAt: now,
            updatedAt: now
          }))
        )
        words += chapterWords
      }
    }
  })

  await updateProject(projectId, {
    source: 'import',
    importedAt: now,
    importMethod: book.method,
    ...(book.frontMatter.length ? { frontMatter: book.frontMatter.join('\n\n') } : {})
  })

  return { projectId, chapters: chapterOrder, scenes: sceneNumber, words }
}
