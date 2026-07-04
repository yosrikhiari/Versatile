import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.0.227/pdf.worker.min.mjs'

const SCANNED_PAGE_THRESHOLD = 50
const SCANNED_MIN_PAGES = 3
const MAX_PDF_PAGES = 500

function yieldToMain() {
  return new Promise((r) => setTimeout(r, 0))
}

export function detectFileType(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.txt')) return 'txt'
  if (name.endsWith('.md')) return 'md'
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html'
  return null
}

export async function extractPdfText(file, onProgress = () => {}) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages = []
  let totalChars = 0
  const numPages = Math.min(pdf.numPages, MAX_PDF_PAGES)

  for (let i = 1; i <= numPages; i++) {
    onProgress(Math.round((i / numPages) * 100))
    await yieldToMain()

    let pageText = ''
    try {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      pageText = content.items.map((item) => item.str).join(' ')
    } catch (err) {
      console.warn(`Failed to extract PDF page ${i}:`, err.message)
    }

    pages.push(pageText)
    totalChars += pageText.length
  }

  if (pdf.numPages > MAX_PDF_PAGES) {
    console.warn(`PDF has ${pdf.numPages} pages, capped at ${MAX_PDF_PAGES}`)
  }

  const effectivePages = Math.min(pdf.numPages, MAX_PDF_PAGES)
  if (effectivePages >= SCANNED_MIN_PAGES && totalChars / effectivePages < SCANNED_PAGE_THRESHOLD) {
    return { text: '', isScanned: true, pageCount: effectivePages }
  }

  return { text: pages.join('\n\n'), isScanned: false, pageCount: effectivePages }
}

export async function extractPlainText(file) {
  return file.text()
}

export async function extractFileText(file, onProgress = () => {}) {
  const type = detectFileType(file)
  if (!type) throw new Error(`Unsupported file type: ${file.name}`)

  if (type === 'pdf') {
    const result = await extractPdfText(file, onProgress)
    if (result.isScanned) {
      return { text: '', isScanned: true, fileName: file.name }
    }
    return { text: result.text, isScanned: false, fileName: file.name }
  }

  const text = await extractPlainText(file)
  return { text, isScanned: false, fileName: file.name }
}
