const BLOCK_TAGS = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE']

interface Paragraph {
  paragraphIndex: number
  textContent: string
  htmlContent: string
}

interface DialogueBlock extends Paragraph {
  dialogueLines: unknown[]
}

export function parseHtmlToParagraphs(html: string): Paragraph[] {
  if (!html || typeof html !== 'string') return []

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const body = doc.body

  const paragraphs: Paragraph[] = []
  let paragraphIndex = 0

  function extractText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      if (el.tagName === 'BR') return '\n'
      let text = ''
      for (const child of el.childNodes) {
        text += extractText(child)
      }
      return text
    }
    return ''
  }

  function processNode(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      if (BLOCK_TAGS.includes(el.tagName)) {
        const textContent = extractText(el).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()

        const htmlContent = el.outerHTML

        paragraphs.push({
          paragraphIndex: paragraphIndex++,
          textContent,
          htmlContent
        })
        return
      }
    }

    for (const child of node.childNodes) {
      processNode(child)
    }
  }

  processNode(body)

  return paragraphs
}

export function parseHtmlToDialogueBlocks(html: string, dialogueDetector: ((text: string) => unknown[]) | null): DialogueBlock[] {
  const paragraphs = parseHtmlToParagraphs(html)
  if (!dialogueDetector) return paragraphs as DialogueBlock[]

  const blocks: DialogueBlock[] = []
  for (const para of paragraphs) {
    const detected = dialogueDetector(para.textContent)
    blocks.push({
      ...para,
      dialogueLines: detected
    })
  }
  return blocks
}
