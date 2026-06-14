import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { exportToPDF } from './dbService'

export async function exportManuscriptToPDF(projectId, projectName = 'Manuscript') {
  const data = await exportToPDF(projectId)
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

  function addWrappedText(text, fontSize = 12, fontStyle = 'normal', lineHeight = 6) {
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

  if (data.project?.synopsis) {
    y += 5
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Synopsis', margin, y)
    y += 8
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    addWrappedText(data.project.synopsis, 11)
    y += 5
  }

  if (data.characters && data.characters.length > 0) {
    y += 5
    checkPageBreak(30)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Characters', margin, y)
    y += 10

    const charData = data.characters.map(c => [c.name, c.role || '-', c.goal || '-'])
    doc.autoTable({
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
    y = doc.lastAutoTable.finalY + 10
  }

  if (data.locations && data.locations.length > 0) {
    checkPageBreak(30)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Locations', margin, y)
    y += 10

    const locData = data.locations.map(l => [l.name, l.description || '-'])
    doc.autoTable({
      startY: y,
      head: [['Location', 'Description']],
      body: locData,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [60, 60, 60] },
      styles: { fontSize: 10, cellPadding: 3 }
    })
    y = doc.lastAutoTable.finalY + 10
  }

  if (data.plotThreads && data.plotThreads.length > 0) {
    checkPageBreak(30)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Plot Threads', margin, y)
    y += 10

    const threadData = data.plotThreads.map(t => [t.title, t.status || 'open', t.notes || '-'])
    doc.autoTable({
      startY: y,
      head: [['Plot Thread', 'Status', 'Notes']],
      body: threadData,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [60, 60, 60] },
      styles: { fontSize: 10, cellPadding: 3 }
    })
    y = doc.lastAutoTable.finalY + 10
  }

  if (data.chapters && data.chapters.length > 0) {
    for (const chapter of data.chapters) {
      addNewPage()
      checkPageBreak(20)
      
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(`Chapter ${chapter.order + 1}: ${chapter.title || 'Untitled'}`, margin, y)
      y += 10
      
      if (chapter.summary) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'italic')
        doc.text(chapter.summary, margin, y)
        y += 8
      }
      
      y += 5
      
      const chapterScenes = data.scenes?.filter(s => s.chapterId === chapter.id) || []
      if (chapterScenes.length > 0) {
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text('Scenes:', margin, y)
        y += 7
        
        for (const scene of chapterScenes) {
          checkPageBreak(15)
          doc.setFontSize(11)
          doc.setFont('helvetica', 'normal')
          doc.text(`• ${scene.title || 'Untitled Scene'}`, margin + 5, y)
          y += 5
          
          if (scene.summary) {
            doc.setFontSize(10)
            doc.setFont('helvetica', 'italic')
            doc.text(`  ${scene.summary}`, margin + 10, y)
            y += 5
          }
          y += 2
        }
        y += 5
      }
      
      if (chapter.status === 'writing' && data.manuscript?.content) {
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

export function exportToEpub() {
  console.log('ePub export not yet implemented')
  alert('ePub export coming soon! For now, please use PDF export.')
}