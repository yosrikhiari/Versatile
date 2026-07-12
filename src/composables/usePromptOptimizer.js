import { ref } from 'vue'
import { generateEntity } from './generation/pipeline'
import { createOptimizationSession } from '../services/db-optimizations'
import dimensionPromptMap from '../evaluation/dimensionPromptMap.json'

export function usePromptOptimizer() {
  const isOptimizing = ref(false)
  const comparison = ref(null)
  const error = ref(null)

  async function optimize({
    projectId,
    sceneId,
    entityType = 'character',
    lowDimensions = [],
    onGenerate
  }) {
    if (!lowDimensions.length) {
      error.value = 'No low-scoring dimensions to optimize for.'
      return
    }

    isOptimizing.value = true
    error.value = null
    comparison.value = null

    const improvements = lowDimensions.map((dim) => {
      const entry = dimensionPromptMap.dimensionMap[dim]
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
    } catch (err) {
      error.value = err.message
      return null
    } finally {
      isOptimizing.value = false
    }
  }

  async function acceptPatch(session) {
    session.chosen = 'patched'
    if (session.id) {
      await createOptimizationSession({ ...session, status: 'patched-accepted' })
    }
  }

  async function rejectPatch(session) {
    session.chosen = 'original'
    if (session.id) {
      await createOptimizationSession({ ...session, status: 'original-kept' })
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
