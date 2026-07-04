export const SIGNAL = {
  ACCEPTED: 'accepted',
  PARTIAL: 'partial',
  NEUTRAL: 'neutral',
  REJECTED: 'rejected'
}

export const ARCHIVE_TYPES = {
  SPARK_PROMPT: 'spark_prompt',
  SPARK_OUTLINE: 'spark_outline',
  SPARK_CONTENT: 'spark_content',
  POLISH_ANALYSIS: 'polish_analysis',
  POLISH_ANNOTATION: 'polish_annotation',
  REVISE_COMMENT: 'revise_comment',
  ENTITY_GENERATION: 'entity_generation',
  ENTITY_ENHANCE: 'entity_enhance',
  SESSION_END: 'session_end',
  STATE_SNAPSHOT: 'state_snapshot',
  MANUAL_STATE: 'manual_state'
}

export const CONTEXT_SOURCES = {
  AUTHOR_PROFILE: 'author_profile',
  STATE_SNAPSHOT: 'state_snapshot',
  ARCHIVE_ENTRY: 'archive_entry'
}

export function createDryRunPreview(contextPackage) {
  return {
    contextText: contextPackage.contextText,
    sourceDescription: contextPackage.sourceDescription,
    previewLines: contextPackage.previewLines.map((pl) => ({
      source: pl.source,
      type: pl.type,
      signal: pl.signal || null,
      summary: pl.summary
    }))
  }
}
