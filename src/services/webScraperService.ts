import { api } from './api'

export async function fetchUrlText(
  url: string,
  storyId: string
): Promise<{ text: string; title: string; statusCode: number }> {
  const result = await api<{ title: string; html: string; statusCode: number }>(
    `/story/${storyId}/research-document/fetch-url`,
    { method: 'POST', body: { url } }
  )
  const { title, html, statusCode } = result!

  if (statusCode >= 400) {
    throw new Error(`Server returned ${statusCode} for ${url}`)
  }

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return { text, title, statusCode }
}
