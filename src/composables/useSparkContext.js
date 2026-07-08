import { ref, computed } from 'vue'
import { MODE_CHAPTER, MODE_SCENE } from '../constants/generationModes'

// Bridges Spark output (blueprints / generated content / conversation) into the
// story generator as seed context, and switches the generator to the matching
// tab. Extracted from StoryGeneratorPanel so that component stays an orchestrator.
// Deps are injected: the spark store, a conversation-turns getter, and a setTab
// callback (the panel owns the active tab).
export function useSparkContext({ sparkStore, getTurns, setTab }) {
  const sparkContext = ref('')

  // Human-readable label for what's about to be sent to the generator.
  const sparkContextLabel = computed(() => {
    if (sparkStore.currentOutline) {
      const title = sparkStore.currentOutline.title
      return title ? `Blueprint: "${title}"` : 'Chapter Blueprint'
    }
    if (sparkStore.currentContent) {
      const snippet = sparkStore.currentContent.slice(0, 60).replace(/\n/g, ' ')
      return `Content: "${snippet}${sparkStore.currentContent.length > 60 ? '…' : ''}"`
    }
    return 'Spark output'
  })

  function formatBlueprintAsContext(blueprint) {
    const lines = [
      blueprint.title ? `Chapter: ${blueprint.title}` : null,
      blueprint.openingBeat ? `Opening beat: ${blueprint.openingBeat}` : null,
      blueprint.turningPoint ? `Turning point: ${blueprint.turningPoint}` : null,
      blueprint.confrontationBeat ? `Confrontation: ${blueprint.confrontationBeat}` : null,
      blueprint.closingBeat ? `Closing beat: ${blueprint.closingBeat}` : null,
      blueprint.sensoryAnchor ? `Sensory anchor: ${blueprint.sensoryAnchor}` : null,
      blueprint.dialogueHook ? `Dialogue hook: ${blueprint.dialogueHook}` : null,
      blueprint.writingNotes ? `Notes: ${blueprint.writingNotes}` : null
    ].filter(Boolean)
    return lines.join('\n')
  }

  function handleSendSparkToGenerator() {
    // Priority 1: blueprint — the most structured context; must be formatted from
    // the object, not the conversation turn (turns only store a compact summary).
    if (sparkStore.currentOutline) {
      sparkContext.value = formatBlueprintAsContext(sparkStore.currentOutline)
      setTab(MODE_CHAPTER)
      return
    }

    // Priority 2: generated chapter content
    if (sparkStore.currentContent) {
      sparkContext.value = sparkStore.currentContent
      setTab(MODE_SCENE)
      return
    }

    // Priority 3: last assistant turn in the conversation (prompt / partial stream)
    const turns = getTurns('spark_default')
    const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant')
    sparkContext.value = lastAssistant?.content || sparkStore.currentStreamingContent || ''
    setTab('chapter')
  }

  function clearSparkContext() {
    sparkContext.value = ''
  }

  return {
    sparkContext,
    sparkContextLabel,
    formatBlueprintAsContext,
    handleSendSparkToGenerator,
    clearSparkContext
  }
}
