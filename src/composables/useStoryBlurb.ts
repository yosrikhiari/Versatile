import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { aiGenerate, resolveFeatureConfig } from './useAiService'
import type { AiGenerateOptions } from '../services/aiService'
import { FEATURES } from '../config/ai'
import { saveBlurb, getBlurbsByProject, deleteBlurb } from '../services/db-blurbs'

const MAX_STYLE_WORDS = 5000
const MAX_SECTIONS_FOR_STYLE = 2

function countWords(text: string) {
  if (!text) return 0
  return text.trim().split(/\s+/).length
}

function collectBibleContext(bibleStore: any) {
  const parts = []

  if (bibleStore.characters?.length) {
    const charLines = bibleStore.characters.map((c: any) => {
      const traits = [c.name]
      if (c.role) traits.push(`Role: ${c.role}`)
      if (c.goal) traits.push(`Goal: ${c.goal}`)
      if (c.notes) traits.push(`Notes: ${c.notes}`)
      return traits.join(' | ')
    })
    parts.push('=== CHARACTERS ===')
    parts.push(charLines.join('\n'))
  }

  if (bibleStore.locations?.length) {
    const locLines = bibleStore.locations.map((l: any) => {
      const info = [l.name]
      if (l.description) info.push(l.description)
      if (l.notes) info.push(l.notes)
      return info.join(' | ')
    })
    parts.push('=== LOCATIONS ===')
    parts.push(locLines.join('\n'))
  }

  if (bibleStore.plotThreads?.length) {
    const plotLines = bibleStore.plotThreads.map((p: any) => {
      const info = [p.title]
      if (p.status) info.push(`Status: ${p.status}`)
      if (p.notes) info.push(p.notes)
      return info.join(' | ')
    })
    parts.push('=== PLOT THREADS ===')
    parts.push(plotLines.join('\n'))
  }

  return parts.join('\n\n')
}

function collectStyleSample(manuscriptStore: any) {
  const sections = manuscriptStore.sortedSections?.slice(0, MAX_SECTIONS_FOR_STYLE)
  if (!sections?.length) return ''

  const parts = []
  let totalWords = 0

  for (const section of sections) {
    if (totalWords >= MAX_STYLE_WORDS) break

    const header = section.title || `Chapter ${section.order || '?'}`
    const subsections = manuscriptStore.subsectionsBySection?.[section.id]
    if (!subsections?.length) {
      if (section.summary) {
        parts.push(`[${header}]`)
        parts.push(section.summary)
        totalWords += countWords(section.summary)
      }
      continue
    }

    const sceneTexts = []
    let sectionWords = 0

    for (const sub of subsections) {
      const content = sub.content || sub.summary || ''
      if (!content) continue
      const wordLen = countWords(content)
      if (totalWords + sectionWords + wordLen > MAX_STYLE_WORDS) {
        const remaining = MAX_STYLE_WORDS - (totalWords + sectionWords)
        const words = content.trim().split(/\s+/)
        sceneTexts.push(words.slice(0, remaining).join(' '))
        sectionWords += remaining
        break
      }
      sceneTexts.push(content)
      sectionWords += wordLen
    }

    if (sceneTexts.length) {
      parts.push(`[${header}]`)
      parts.push(sceneTexts.join('\n\n'))
      totalWords += sectionWords
    }
  }

  return parts.join('\n\n')
}

function buildBlurbPrompt(bibleContext: string, styleSample: string, { tone, length }: { tone?: string; length?: string }) {
  const toneMap = {
    dramatic: 'dramatic and emotionally charged',
    mysterious: 'intriguing and mysterious, hinting at secrets',
    commercial: 'commercial and hook-driven, emphasizing stakes',
    literary: 'literary and evocative, focused on theme and atmosphere'
  }
  const toneDesc = toneMap[tone as keyof typeof toneMap] || 'compelling and engaging'

  const lengthMap = {
    short: '50-80 words',
    standard: '120-180 words',
    long: '250-350 words'
  }
  const lengthDesc = lengthMap[length as keyof typeof lengthMap] || '120-180 words'

  const sections = []
  sections.push(`Generate a book blurb in the following style: ${toneDesc}`)

  if (bibleContext) {
    sections.push('=== STORY CONTEXT ===', bibleContext)
  } else {
    sections.push(
      '(No story bible context available — base the blurb on the manuscript prose only.)'
    )
  }

  if (styleSample) {
    sections.push(
      '=== STYLE SAMPLE ===',
      'Below is the opening of the manuscript. Match the narrative voice and feel of this prose:',
      styleSample
    )
  }

  sections.push(
    `=== OUTPUT ===\nWrite a ${lengthDesc} book blurb. Return only the blurb text, no commentary.`
  )

  return sections.join('\n\n')
}

export function useStoryBlurb() {
  const generating = ref(false)
  const error = ref<string | null>(null)

  async function generateBlurb({ tone, length }: { tone?: string; length?: string } = {}) {
    generating.value = true
    error.value = null

    try {
      const projectStore = useProjectStore()
      const manuscriptStore = useManuscriptStore()
      const bibleStore = useStoryBibleStore()

      const projectId = projectStore.currentProjectId
      if (!projectId) {
        error.value = 'No project selected.'
        return { success: false, error: 'No project selected.' }
      }

      const bibleContext = collectBibleContext(bibleStore)
      const styleSample = collectStyleSample(manuscriptStore)

      if (!styleSample && !bibleContext) {
        error.value = 'No manuscript content or story bible available. Write some prose first.'
        return {
          success: false,
          error: 'No manuscript content or story bible available. Write some prose first.'
        }
      }

      const warnings = []
      if (!bibleContext) warnings.push('No story bible context available.')
      const sectionCount = manuscriptStore.sortedSections?.length || 0
      if (sectionCount < MAX_SECTIONS_FOR_STYLE) {
        warnings.push(
          `Only ${sectionCount} section(s) available. A larger sample improves blurb quality.`
        )
      }

      const prompt = buildBlurbPrompt(bibleContext, styleSample, { tone, length })
      const raw = resolveFeatureConfig(FEATURES.BLURB)
      const config: AiGenerateOptions = { provider: raw.provider, model: raw.model ?? undefined }
      const systemPrompt =
        'You are a professional book blurb writer. Write concise, compelling marketing copy for fiction.'

      const blurb = await aiGenerate(prompt, systemPrompt, config)

      if (!blurb?.trim()) {
        error.value = 'AI returned an empty blurb.'
        return { success: false, error: 'AI returned an empty blurb.' }
      }

      const version = Date.now()
      await saveBlurb({
        projectId,
        blurb: blurb.trim(),
        tone: tone || 'standard',
        length: length || 'standard',
        version,
        generatedAt: new Date().toISOString()
      })

      return {
        success: true,
        blurb: blurb.trim(),
        version,
        warning: warnings.length ? warnings.join(' ') : null
      }
    } catch (err: any) {
      console.error('[useStoryBlurb] generateBlurb error:', err)
      error.value = err.message || 'Failed to generate blurb.'
      return { success: false, error: err.message || 'Failed to generate blurb.' }
    } finally {
      generating.value = false
    }
  }

  async function getBlurbHistory() {
    const projectStore = useProjectStore()
    const projectId = projectStore.currentProjectId
    if (!projectId) return []
    return getBlurbsByProject(projectId)
  }

  return {
    generating,
    error,
    generateBlurb,
    getBlurbHistory,
    deleteBlurb
  }
}
