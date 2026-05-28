function getFullText(story) {
  if (story.fullText) return story.fullText
  if (story.scenes && Array.isArray(story.scenes)) {
    return story.scenes.map(s => s.prose || '').join('\n\n')
  }
  return ''
}

function getTitle(story) {
  return story.title || 'Untitled'
}

function sanitizeFilename(title) {
  return title.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_')
}

export function useStoryExport() {
  function exportAsText(story) {
    const fullText = getFullText(story)
    const content = `${getTitle(story)}\n\n${fullText}`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeFilename(getTitle(story))}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function exportAsMarkdown(story) {
    const parts = [`# ${getTitle(story)}`, '']
    if (story.scenes && Array.isArray(story.scenes)) {
      for (const scene of story.scenes) {
        parts.push(scene.prose, '')
      }
    } else if (story.fullText) {
      parts.push(story.fullText)
    }
    const content = parts.join('\n')
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeFilename(getTitle(story))}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function copyToClipboard(story) {
    const text = getFullText(story)
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  return { exportAsText, exportAsMarkdown, copyToClipboard }
}
