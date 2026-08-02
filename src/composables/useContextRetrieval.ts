import { getAuthorProfile, getLatestStateSnapshot, getSessionArchive } from '../services/dbService'
import { useAuthorModel } from './useAuthorModel'
import { useStateSummarizer } from './useStateSummarizer'
import { CONTEXT_SOURCES, ARCHIVE_TYPES, createDryRunPreview } from '../config/archive'
import { useSettingsStore } from '../stores/settingsStore'
import { fitToBudget, type Block } from '../services/ai/contextBudget'
import { inputBudgetForModel, resolveMaxTokens } from '../services/ai/modelBudget'
import { getConfiguredModel, getConfiguredProvider } from '../services/aiService'

export function useContextRetrieval() {
  const settingsStore = useSettingsStore()

  function getContextBudget(model?: string): number {
    const provider = getConfiguredProvider('context_retrieval')
    const usedModel = model || getConfiguredModel('context_retrieval')
    return inputBudgetForModel(usedModel || 'unknown')
  }

  function fitContext(blocks: Block[], budgetTokens: number) {
    const result = fitToBudget(blocks, budgetTokens)
    return {
      text: result.text,
      usedTokens: result.usedTokens,
      budgetTokens: result.budgetTokens,
      fits: result.fits
    }
  }

  async function getContextPackage(projectId: any) {
    if (!projectId) return null

    const previewLines = []
    const contextBlocks: { name: string; text: string; priority: number; required?: boolean; minTokens?: number }[] = []

    const authorProfile = await getAuthorProfile(projectId)
    if (authorProfile) {
      const { profileToContextString: toStr } = useAuthorModel()
      const profileStr = toStr(authorProfile)
      if (profileStr) {
        contextBlocks.push({
          name: 'authorProfile',
          text: profileStr,
          priority: 100,
          required: true
        })
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
        contextBlocks.push({
          name: 'latestState',
          text: stateStr,
          priority: 80,
          minTokens: 200
        })
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
      types: [
        ARCHIVE_TYPES.POLISH_ANALYSIS,
        ARCHIVE_TYPES.SPARK_CONTENT,
        ARCHIVE_TYPES.SESSION_END,
        ARCHIVE_TYPES.ENTITY_GENERATION
      ]
    })

    for (const entry of archiveEntries) {
      const entryStr = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)
      contextBlocks.push({
        name: `archive:${entry.type}`,
        text: entryStr,
        priority: 30,
        minTokens: 50
      })
      previewLines.push({
        source: `Archive: ${entry.type}`,
        type: CONTEXT_SOURCES.ARCHIVE_ENTRY,
        signal: entry.signal,
        summary: entryStr.slice(0, 80) + (entryStr.length > 80 ? '...' : '')
      })
    }

    // Use the actual model's token budget instead of hard char limit
    const budgetTokens = getContextBudget()
    const fitted = fitContext(contextBlocks, budgetTokens)

    const sourceCount = previewLines.length
    const typeLabels = previewLines.map((p) => p.type).join(' + ')

    return {
      contextText: fitted.text.trim(),
      sourceDescription: `${sourceCount} source(s): ${typeLabels}`,
      previewLines,
      usedTokens: fitted.usedTokens,
      budgetTokens: fitted.budgetTokens,
      fits: fitted.fits
    }
  }

  async function dryRun(projectId: any) {
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
