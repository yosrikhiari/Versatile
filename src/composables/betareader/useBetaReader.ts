import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { extractAllFacts } from './factLedger'
import { detectContradictions } from './contradictionDetector'
import { resolveBatchInjector, combineDisclosures } from './cloudContradictions'
import {
  buildCloudDisclosure,
  canUseCloudEscalation,
  getAnalysisTier,
  type CloudDisclosure
} from '../../services/cloudEscalation'
import { aiGenerateJson } from '../useAiService'
import { analyzeArc } from './arcAnalyzer'
import { detectRepetitions } from './repetitionDetector'
import { buildBetaReport } from './betaReport'
import { useEvalPersistence } from '../useEvalPersistence'
import { guardAnalysis } from '../../guardrails/integration/composableGuardrails'

const PASSES = [
  { key: 'factLedger', label: 'Extracting fact ledger…' },
  { key: 'contradictions', label: 'Detecting cross-scene contradictions…' },
  { key: 'arc', label: 'Analyzing narrative arc…' },
  { key: 'repetition', label: 'Checking for repetitive patterns…' }
]

export function useBetaReader() {
  const isScanning = ref(false)
  const results: any = ref([])
  const counts: any = ref({ errors: 0, warnings: 0, info: 0 })
  const resultsBySeverity: any = ref({ errors: [], warnings: [], info: [] })
  const resultsByPass: any = ref({})
  const summary: any = ref(null)
  const activePass = ref(0)
  const currentPhase = ref('')
  // Per-run opt-in for on-demand cloud contradiction detection. Defaults off;
  // the panel binds its checkbox to this ref.
  const cloudRunOptIn = ref(false)
  const cloudDisclosure = ref<CloudDisclosure | null>(null)
  // Tier/availability snapshot for the panel's opt-in visibility. Evaluated
  // lazily so the panel stays in sync with settings.
  const cloudTier = computed(() => getAnalysisTier())
  const cloudAvailable = computed(() => canUseCloudEscalation())

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
      const passResults: any = {}

      // Disclosure for the panel's opt-in line, built before the pass starts.
      // Best-effort: a disclosure failure must never block the local pass.
      // One combined line for the whole run: each routed pass previously
      // overwrote the last, so a three-pass cloud run displayed one pass's
      // estimate. resolveBatchInjector is pure, so probing twice (here and
      // in the pass branches below) is cheap and keeps this block local.
      try {
        if (canUseCloudEscalation()) {
          const settings = useSettingsStore()
          const manuscriptText = scenes.map((s) => s.content).join('\n\n')
          const ctxBase = {
            tier: getAnalysisTier(),
            cloudAvailable: true,
            runOptIn: cloudRunOptIn.value,
            projectOptIn: settings.cloudAuditOptIn,
            provider: settings.aiProvider,
            model: settings.ollamaModel,
            localGenerateJson: aiGenerateJson
          }
          const routed: Array<{ operation: any; systemPrompt: string }> = []
          if (resolveBatchInjector(ctxBase)) {
            routed.push({
              operation: 'contradiction-sweep',
              systemPrompt: 'You are an expert fiction editor. Detect contradictions across scenes.'
            })
          }
          if (resolveBatchInjector(ctxBase)) {
            routed.push({
              operation: 'structural-arc',
              systemPrompt: 'You are a narrative structure analyst for fiction manuscripts.'
            })
          }
          if (resolveBatchInjector(ctxBase)) {
            routed.push({
              operation: 'pacing-review',
              systemPrompt: 'You are a prose style analyst for fiction manuscripts.'
            })
          }
          const built = []
          for (const r of routed) {
            built.push(
              await buildCloudDisclosure({
                projectId,
                operation: r.operation,
                text: manuscriptText,
                systemPrompt: r.systemPrompt,
                provider: settings.aiProvider,
                model: settings.ollamaModel
              })
            )
          }
          cloudDisclosure.value = combineDisclosures(built)
        } else {
          cloudDisclosure.value = null
        }
      } catch {
        cloudDisclosure.value = null
      }

      for (let i = 0; i < PASSES.length; i++) {
        const pass = PASSES[i]
        activePass.value = i
        currentPhase.value = pass.label

        // How much of the ledger came from committed digests rather than fresh
        // model calls — the difference between seconds and hours at scale.
        if (pass.key === 'factLedger') {
          passResults.factLedger = await extractAllFacts(scenes, aiOptions, projectId)
        } else if (pass.key === 'contradictions') {
          const tier = getAnalysisTier()
          const available = canUseCloudEscalation()
          const settings = useSettingsStore()
          const projectOptIn = settings.cloudAuditOptIn
          const injector = resolveBatchInjector({
            tier,
            cloudAvailable: available,
            runOptIn: cloudRunOptIn.value,
            projectOptIn,
            provider: settings.aiProvider,
            model: settings.ollamaModel,
            localGenerateJson: aiGenerateJson
          })
          if (injector) {
            passResults.contradictions = await detectContradictions(
              passResults.factLedger,
              scenes,
              aiOptions,
              { generateJson: injector }
            )
          } else {
            passResults.contradictions = await detectContradictions(
              passResults.factLedger,
              scenes,
              aiOptions
            )
          }
        } else if (pass.key === 'arc') {
          const tier = getAnalysisTier()
          const available = canUseCloudEscalation()
          const settings = useSettingsStore()
          const injector = resolveBatchInjector({
            tier,
            cloudAvailable: available,
            runOptIn: cloudRunOptIn.value,
            projectOptIn: settings.cloudAuditOptIn,
            provider: settings.aiProvider,
            model: settings.ollamaModel,
            localGenerateJson: aiGenerateJson
          })
          if (injector) {
            passResults.arc = await analyzeArc(scenes, aiOptions, { generateJson: injector })
          } else {
            passResults.arc = await analyzeArc(scenes, aiOptions)
          }
        } else if (pass.key === 'repetition') {
          const tier = getAnalysisTier()
          const available = canUseCloudEscalation()
          const settings = useSettingsStore()
          const injector = resolveBatchInjector({
            tier,
            cloudAvailable: available,
            runOptIn: cloudRunOptIn.value,
            projectOptIn: settings.cloudAuditOptIn,
            provider: settings.aiProvider,
            model: settings.ollamaModel,
            localGenerateJson: aiGenerateJson
          })
          if (injector) {
            passResults.repetitions = await detectRepetitions(scenes, aiOptions, {
              generateJson: injector
            })
          } else {
            passResults.repetitions = await detectRepetitions(scenes, aiOptions)
          }
        }
      }

      const report = buildBetaReport(passResults)

      // Validated before it reaches db.evalResults — a malformed report breaks
      // aggregation silently rather than loudly.
      await guardAnalysis({ result: report })

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
    cloudRunOptIn,
    cloudTier,
    cloudAvailable,
    cloudDisclosure,
    scan,
    clearResults
  }
}
