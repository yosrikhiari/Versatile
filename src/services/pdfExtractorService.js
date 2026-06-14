import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.0.227/pdf.worker.min.mjs'

const SCANNED_PAGE_THRESHOLD = 50
const SCANNED_MIN_PAGES = 3

export function detectFileType(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.txt')) return 'txt'
  if (name.endsWith('.md')) return 'md'
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html'
  return null
}

export async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages = []
  let totalChars = 0

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    pages.push(pageText)
    totalChars += pageText.length
  }

  if (pdf.numPages >= SCANNED_MIN_PAGES && totalChars / pdf.numPages < SCANNED_PAGE_THRESHOLD) {
    return { text: '', isScanned: true, pageCount: pdf.numPages }
  }

  return { text: pages.join('\n\n'), isScanned: false, pageCount: pdf.numPages }
}

export async function extractPlainText(file) {
  return file.text()
}

export async function extractFileText(file) {
  const type = detectFileType(file)
  if (!type) throw new Error(`Unsupported file type: ${file.name}`)

  if (type === 'pdf') {
    const result = await extractPdfText(file)
    if (result.isScanned) {
      return { text: '', isScanned: true, fileName: file.name }
    }
    return { text: result.text, isScanned: false, fileName: file.name }
  }

  const text = await extractPlainText(file)
  return { text, isScanned: false, fileName: file.name }
}
