const BLOCK_TAGS = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE']

export function parseHtmlToParagraphs(html) {
  if (!html || typeof html !== 'string') return []

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const body = doc.body

  const paragraphs = []
  let paragraphIndex = 0

  function extractText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'BR') return '\n'
      let text = ''
      for (const child of node.childNodes) {
        text += extractText(child)
      }
      return text
    }
    return ''
  }

  function processNode(node) {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.includes(node.tagName)) {
      const textContent = extractText(node).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()

      const htmlContent = node.outerHTML

      paragraphs.push({
        paragraphIndex: paragraphIndex++,
        textContent,
        htmlContent
      })
      return
    }

    for (const child of node.childNodes) {
      processNode(child)
    }
  }

  processNode(body)

  return paragraphs
}

export function parseHtmlToDialogueBlocks(html, dialogueDetector) {
  const paragraphs = parseHtmlToParagraphs(html)
  if (!dialogueDetector) return paragraphs

  const blocks = []
  for (const para of paragraphs) {
    const detected = dialogueDetector(para.textContent)
    blocks.push({
      ...para,
      dialogueLines: detected
    })
  }
  return blocks
}
