import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { exportToPDF } from './dbService'
import { rtfEscape } from './rtf'

interface PdfCharacter {
  name: string
  role?: string
  goal?: string
}

interface PdfLocation {
  name: string
  description?: string
}

interface PdfPlotThread {
  title: string
  status?: string
  notes?: string
}

interface PdfSubsection {
  sectionId: string
  title?: string
  summary?: string
}

interface PdfSection {
  id: string
  order: number
  title?: string
  summary?: string
  status?: string
}

interface PdfManuscript {
  content?: string
  wordCount?: number
}

interface PdfProject {
  genre?: string
  description?: string
  /** Older rows stored the premise here; `description` wins when both exist. */
  synopsis?: string
}

interface PdfExportData {
  project: PdfProject | null
  manuscript: PdfManuscript | null
  sections: PdfSection[]
  subsections: PdfSubsection[]
  characters: PdfCharacter[]
  locations: PdfLocation[]
  plotThreads: PdfPlotThread[]
}

export async function exportManuscriptToPDF(projectId: string, projectName = 'Manuscript') {
  const data = (await exportToPDF(projectId)) as unknown as PdfExportData
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const maxLineWidth = pageWidth - margin * 2
  let y = margin

  function addNewPage() {
    doc.addPage()
    y = margin
  }

  function checkPageBreak(requiredSpace = 20) {
    if (y + requiredSpace > pageHeight - margin) {
      addNewPage()
    }
  }

  function addWrappedText(
    text: string,
    fontSize = 12,
    fontStyle: 'normal' | 'bold' | 'italic' = 'normal',
    lineHeight = 6
  ) {
    doc.setFontSize(fontSize)
    doc.setFont('helvetica', fontStyle)
    const lines = doc.splitTextToSize(text, maxLineWidth)

    for (const line of lines) {
      checkPageBreak(lineHeight + 2)
      doc.text(line, margin, y)
      y += lineHeight
    }
    y += 4
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text(projectName, pageWidth / 2, y, { align: 'center' })
  y += 15

  if (data.project?.genre) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'italic')
    doc.text(`Genre: ${data.project.genre}`, pageWidth / 2, y, { align: 'center' })
    y += 10
  }

  const synopsis = data.project?.description || data.project?.synopsis
  if (synopsis) {
    y += 5
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Synopsis', margin, y)
    y += 8
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    addWrappedText(synopsis, 11)
    y += 5
  }

  if (data.characters && data.characters.length > 0) {
    y += 5
    checkPageBreak(30)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Characters', margin, y)
    y += 10

    const charData = data.characters.map((c) => [c.name, c.role || '-', c.goal || '-'])
    autoTable(doc, {
      startY: y,
      head: [['Name', 'Role', 'Goal']],
      body: charData,
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 40 },
        2: { cellWidth: 'auto' }
      },
      headStyles: { fillColor: [60, 60, 60] },
      styles: { fontSize: 10, cellPadding: 3 }
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  if (data.locations && data.locations.length > 0) {
    checkPageBreak(30)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Locations', margin, y)
    y += 10

    const locData = data.locations.map((l) => [l.name, l.description || '-'])
    autoTable(doc, {
      startY: y,
      head: [['Location', 'Description']],
      body: locData,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [60, 60, 60] },
      styles: { fontSize: 10, cellPadding: 3 }
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  if (data.plotThreads && data.plotThreads.length > 0) {
    checkPageBreak(30)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Plot Threads', margin, y)
    y += 10

    const threadData = data.plotThreads.map((t) => [t.title, t.status || 'open', t.notes || '-'])
    autoTable(doc, {
      startY: y,
      head: [['Plot Thread', 'Status', 'Notes']],
      body: threadData,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [60, 60, 60] },
      styles: { fontSize: 10, cellPadding: 3 }
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  if (data.sections && data.sections.length > 0) {
    for (const section of data.sections) {
      addNewPage()
      checkPageBreak(20)

      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(`Chapter ${section.order + 1}: ${section.title || 'Untitled'}`, margin, y)
      y += 10

      if (section.summary) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'italic')
        doc.text(section.summary, margin, y)
        y += 8
      }

      y += 5

      const sectionSubsections = data.subsections?.filter((s) => s.sectionId === section.id) || []
      if (sectionSubsections.length > 0) {
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text('Scenes:', margin, y)
        y += 7

        for (const sub of sectionSubsections) {
          checkPageBreak(15)
          doc.setFontSize(11)
          doc.setFont('helvetica', 'normal')
          doc.text(`• ${sub.title || 'Untitled Scene'}`, margin + 5, y)
          y += 5

          if (sub.summary) {
            doc.setFontSize(10)
            doc.setFont('helvetica', 'italic')
            doc.text(`  ${sub.summary}`, margin + 10, y)
            y += 5
          }
          y += 2
        }
        y += 5
      }

      if (section.status === 'writing' && data.manuscript?.content) {
        checkPageBreak(10)
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text('Content:', margin, y)
        y += 8

        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        addWrappedText(data.manuscript.content, 11)
      }
    }
  } else if (data.manuscript?.content) {
    addNewPage()
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Manuscript', margin, y)
    y += 12

    addWrappedText(data.manuscript.content, 11)
  }

  const totalWords = data.manuscript?.wordCount || 0
  addNewPage()
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Total Word Count: ${totalWords.toLocaleString()} words`, margin, y)
  y += 8
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, y)

  doc.save(`${projectName.replace(/[^a-z0-9]/gi, '_')}.pdf`)
}

/**
 * Manuscript export, in the format this market actually moves manuscripts in.
 *
 * The PDF above is a project report — cast, locations, threads, scene outlines.
 * That is not what an author sends an editor, and it is not something anyone can
 * edit on receipt. RTF is: Word, Google Docs, Pages and LibreOffice all open it,
 * and Scrivener imports and exports it natively.
 *
 * RTF rather than DOCX or ePub because both of those are ZIP containers. With no
 * archiver in the dependency tree, emitting one means hand-rolling CRC32 and
 * central-directory records — a lot of binary surface for a format that buys
 * nothing over RTF at the point of handoff. RTF is plain text and costs nothing.
 */
export { rtfEscape }

/** Blank lines separate paragraphs; a first-line indent is manuscript standard. */
function rtfBody(text: string): string {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `{\\pard\\fi360\\sa180 ${rtfEscape(line)}\\par}`)
    .join('\n')
}

/** Pure, so the document can be asserted on without a DOM or a database. */
export function buildManuscriptRtf(data: PdfExportData, projectName = 'Manuscript'): string {
  const parts = [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0',
    '{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}',
    '\\f0\\fs24',
    `{\\pard\\qc\\sa360\\fs48\\b ${rtfEscape(projectName)}\\b0\\par}`
  ]

  if (data.project?.genre) {
    parts.push(`{\\pard\\qc\\sa360\\fs24\\i ${rtfEscape(data.project.genre)}\\i0\\par}`)
  }

  const words = data.manuscript?.wordCount || 0
  if (words > 0) {
    parts.push(`{\\pard\\qc\\sa360\\fs24 ${words.toLocaleString()} words\\par}`)
  }

  const content = data.manuscript?.content || ''
  if (content.trim()) {
    parts.push('{\\pard\\page\\par}')
    parts.push(rtfBody(content))
  }

  parts.push('}')
  return parts.join('\n')
}

/**
 * The manuscript as RTF, compiled in narrative order. This used to write the
 * root document only (`manuscript.content`), which for a book written in
 * scenes is a title page and a word count and nothing else.
 */
export async function exportManuscriptToRtf(projectId: string, _projectName = 'Manuscript') {
  const { exportCompiled } = await import('./compileManuscript')
  return exportCompiled(projectId, 'rtf')
}
