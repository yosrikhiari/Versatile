import { ref } from 'vue'
import { generateEntity } from './generation/pipeline'
import { createOptimizationSession, updateOptimizationSession } from '../services/db-optimizations'
import dimensionPromptMap from '../evaluation/dimensionPromptMap.json'

interface Improvement {
  dimension: string
  label: string
  guidance: string
  snippet: string
}

interface ComparisonResult {
  id: any
  timestamp: string
  improvements: Improvement[]
  extraInstructions: string
  original: any
  patched: any
  chosen: string | null
}

export function usePromptOptimizer() {
  const isOptimizing = ref(false)
  const comparison = ref<ComparisonResult | null>(null)
  const error = ref<string | null>(null)

  async function optimize({
    projectId,
    sceneId,
    entityType = 'character',
    lowDimensions = [],
    onGenerate
  }: {
    projectId: any
    sceneId: any
    entityType?: string
    lowDimensions?: string[]
    onGenerate?: (opts: { entityType: string; extraInstructions: string }) => Promise<any>
  }) {
    if (!lowDimensions.length) {
      error.value = 'No low-scoring dimensions to optimize for.'
      return
    }

    isOptimizing.value = true
    error.value = null
    comparison.value = null

    const improvements: Improvement[] = lowDimensions.map((dim: string) => {
      const entry = (dimensionPromptMap as any).dimensionMap[dim]
      return {
        dimension: dim,
        label: entry?.label || dim,
        guidance: entry?.improvementGuidance || '',
        snippet: entry?.exampleSnippet || ''
      }
    })

    const extraInstructions = improvements
      .map((imp) => `[${imp.label}] ${imp.guidance}\n${imp.snippet}`)
      .filter(Boolean)
      .join('\n\n')

    const timestamp = new Date().toISOString()

    try {
      const originalOutput = onGenerate
        ? await onGenerate({ entityType, extraInstructions: '' })
        : await generateEntity(entityType, '')

      const patchedOutput = onGenerate
        ? await onGenerate({ entityType, extraInstructions })
        : await generateEntity(entityType, extraInstructions)

      const session = {
        projectId,
        sceneId,
        timestamp,
        entityType,
        extraInstructions,
        improvements,
        comparisonResult: {
          original: originalOutput,
          patched: patchedOutput
        },
        status: 'ready'
      }

      const sessionId = await createOptimizationSession(session)

      comparison.value = {
        id: sessionId,
        timestamp,
        improvements,
        extraInstructions,
        original: originalOutput,
        patched: patchedOutput,
        chosen: null
      }

      return comparison.value
    } catch (err: any) {
      error.value = err.message
      return null
    } finally {
      isOptimizing.value = false
    }
  }

  async function acceptPatch(session: { chosen: string | null; id?: any }) {
    session.chosen = 'patched'
    if (session.id) {
      await updateOptimizationSession(session.id, { chosen: 'patched', status: 'patched-accepted' })
    }
  }

  async function rejectPatch(session: { chosen: string | null; id?: any }) {
    session.chosen = 'original'
    if (session.id) {
      await updateOptimizationSession(session.id, { chosen: 'original', status: 'original-kept' })
    }
  }

  return {
    isOptimizing,
    comparison,
    error,
    optimize,
    acceptPatch,
    rejectPatch
  }
}
