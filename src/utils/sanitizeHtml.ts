import DOMPurify from 'dompurify'

/**
 * Sanitize untrusted HTML (AI-generated prose, imports, pastes) before it
 * reaches any v-html sink. There are no v-html sinks today — this exists so
 * the first one has a safe path instead of inventing ad-hoc regex stripping.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return ''
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } })
}
