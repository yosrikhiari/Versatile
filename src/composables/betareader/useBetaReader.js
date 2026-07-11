import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { extractAllFacts } from './factLedger'
import { detectContradictions } from './contradictionDetector'
import { analyzeArc } from './arcAnalyzer'
import { detectRepetitions } from './repetitionDetector'
import { buildBetaReport } from './betaReport'
import { useEvalPersistence } from '../useEvalPersistence'

const PASSES = [
  { key: 'factLedger', label: 'Extracting fact ledger…' },
  { key: 'contradictions', label: 'Detecting cross-scene contradictions…' },
  { key: 'arc', label: 'Analyzing narrative arc…' },
  { key: 'repetition', label: 'Checking for repetitive patterns…' }
]

export function useBetaReader() {
  const isScanning = ref(false)
  const results = ref([])
  const counts = ref({ errors: 0, warnings: 0, info: 0 })
  const resultsBySeverity = ref({ errors: [], warnings: [], info: [] })
  const resultsByPass = ref({})
  const summary = ref(null)
  const activePass = ref(0)
  const currentPhase = ref('')

  const { saveRecord } = useEvalPersistence()

  const progress = computed(() =>
    PASSES.length > 0 ? Math.round((activePass.value / PASSES.length) * 100) : 0
  )

  async function scan() {
    const projectStore = useProjectStore()
    const manuscriptStore = useManuscriptStore()
    const projectId = projectStore.currentProjectId
    if (!projectId) return

    const scenes = [...manuscriptStore.subsections]
      .filter((s) => s.content?.trim())
      .sort((a, b) => (a.sceneNumber || a.order || 0) - (b.sceneNumber || b.order || 0))

    if (scenes.length === 0) return

    isScanning.value = true
    activePass.value = 0

    try {
      const aiOptions = {}
      const passResults = {}

      for (let i = 0; i < PASSES.length; i++) {
        const pass = PASSES[i]
        activePass.value = i
        currentPhase.value = pass.label

        if (pass.key === 'factLedger') {
          passResults.factLedger = await extractAllFacts(scenes, aiOptions)
        } else if (pass.key === 'contradictions') {
          passResults.contradictions = await detectContradictions(
            passResults.factLedger,
            scenes,
            aiOptions
          )
        } else if (pass.key === 'arc') {
          passResults.arc = await analyzeArc(scenes, aiOptions)
        } else if (pass.key === 'repetition') {
          passResults.repetitions = await detectRepetitions(scenes, aiOptions)
        }
      }

      const report = buildBetaReport(passResults)
      results.value = report.allResults
      counts.value = report.counts
      resultsBySeverity.value = report.resultsBySeverity
      resultsByPass.value = report.resultsByPass
      summary.value = report.summary

      await saveRecord({
        projectId,
        evalType: 'beta_reader',
        subtype: 'full_scan',
        score: null,
        results: report,
        timestamp: Date.now()
      })
    } catch (err) {
      console.error('[useBetaReader] Scan failed:', err)
    } finally {
      isScanning.value = false
      activePass.value = 0
      currentPhase.value = ''
    }
  }

  function clearResults() {
    results.value = []
    counts.value = { errors: 0, warnings: 0, info: 0 }
    resultsBySeverity.value = { errors: [], warnings: [], info: [] }
    resultsByPass.value = {}
    summary.value = null
  }

  return {
    isScanning,
    results,
    counts,
    resultsBySeverity,
    resultsByPass,
    summary,
    activePass,
    currentPhase,
    progress,
    scan,
    clearResults
  }
}
