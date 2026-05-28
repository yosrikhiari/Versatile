export function useStoryExport() {
  function exportAsText(story) {
    const content = `${story.title}\n\n${story.fullText}`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${story.title.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function exportAsMarkdown(story) {
    const parts = [`# ${story.title}`, '']
    for (const scene of story.scenes) {
      parts.push(scene.prose, '')
    }
    const content = parts.join('\n')
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${story.title.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function copyToClipboard(story) {
    try {
      await navigator.clipboard.writeText(story.fullText)
    } catch (err) {
      const textarea = document.createElement('textarea')
      textarea.value = story.fullText
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
