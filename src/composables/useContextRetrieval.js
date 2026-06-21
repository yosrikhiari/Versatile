import { getAuthorProfile, getLatestStateSnapshot, getSessionArchive } from '../services/dbService'
import { useAuthorModel } from './useAuthorModel'
import { useStateSummarizer } from './useStateSummarizer'
import { CONTEXT_SOURCES, ARCHIVE_TYPES, createDryRunPreview } from '../config/archive'

const MAX_CONTEXT_CHARS = 2000

export function useContextRetrieval() {
  async function getContextPackage(projectId) {
    if (!projectId) return null

    const previewLines = []
    let contextText = ''
    let totalChars = 0

    const authorProfile = await getAuthorProfile(projectId)
    if (authorProfile) {
      const { profileToContextString: toStr } = useAuthorModel()
      const profileStr = toStr(authorProfile)
      if (profileStr) {
        contextText += profileStr + '\n\n'
        totalChars += profileStr.length + 2
        previewLines.push({
          source: 'Author Profile',
          type: CONTEXT_SOURCES.AUTHOR_PROFILE,
          signal: null,
          summary: `${authorProfile.data?.sessionCount || 0} sessions, ${authorProfile.data?.genreFocus || 'no genre set'}`
        })
      }
    }

    const latestState = await getLatestStateSnapshot(projectId)
    if (latestState) {
      const { snapshotToContextString: toStr } = useStateSummarizer()
      const stateStr = toStr(latestState.state)
      if (stateStr) {
        const remaining = MAX_CONTEXT_CHARS - totalChars
        const truncated = stateStr.length > remaining ? stateStr.slice(0, remaining) : stateStr
        contextText += truncated + '\n\n'
        totalChars += truncated.length + 2
        previewLines.push({
          source: 'Latest State Snapshot',
          type: CONTEXT_SOURCES.STATE_SNAPSHOT,
          signal: null,
          summary: `${latestState.state?.wordCount || 0} words, ${latestState.state?.unresolvedThreads?.length || 0} unresolved threads`
        })
      }
    }

    const archiveEntries = await getSessionArchive(projectId, {
      minSignal: 'partial',
      limit: 5,
      types: [ARCHIVE_TYPES.POLISH_ANALYSIS, ARCHIVE_TYPES.SPARK_CONTENT, ARCHIVE_TYPES.SESSION_END, ARCHIVE_TYPES.ENTITY_GENERATION]
    })

    for (const entry of archiveEntries) {
      const remaining = MAX_CONTEXT_CHARS - totalChars
      if (remaining < 100) break

      const entryStr = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)
      const truncated = entryStr.length > remaining ? entryStr.slice(0, remaining) : entryStr
      contextText += `[Archived: ${entry.type} / ${entry.signal}]\n${truncated}\n\n`
      totalChars += truncated.length + entry.type.length + entry.signal.length + 20

      previewLines.push({
        source: `Archive: ${entry.type}`,
        type: CONTEXT_SOURCES.ARCHIVE_ENTRY,
        signal: entry.signal,
        summary: entryStr.slice(0, 80) + (entryStr.length > 80 ? '...' : '')
      })
    }

    const sourceCount = previewLines.length
    const typeLabels = previewLines.map(p => p.type).join(' + ')

    return {
      contextText: contextText.trim(),
      sourceDescription: `${sourceCount} source(s): ${typeLabels}`,
      previewLines
    }
  }

  async function dryRun(projectId) {
    const pkg = await getContextPackage(projectId)
    if (!pkg) {
      return createDryRunPreview({
        contextText: '',
        sourceDescription: 'No context available',
        previewLines: []
      })
    }
    return createDryRunPreview(pkg)
  }

  return {
    getContextPackage,
    dryRun
  }
}
