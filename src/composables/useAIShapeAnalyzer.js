import { ref } from 'vue'
import { aiGenerateJson } from './useAiService'
import { FEATURES } from '../config/ai'

const SHAPE_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    narrativeArc: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        confidence: { type: 'number' },
        description: { type: 'string' }
      }
    },
    pacingAssessment: {
      type: 'object',
      properties: {
        rating: { type: 'string' },
        strengths: { type: 'array', items: { type: 'string' } },
        concerns: { type: 'array', items: { type: 'string' } }
      }
    },
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          relevance: { type: 'number' },
          evidence: { type: 'string' }
        }
      }
    },
    qualityMetrics: {
      type: 'object',
      properties: {
        sensoryDetail: { type: 'number' },
        dialogueNaturalness: { type: 'number' },
        showVsTell: { type: 'number' },
        emotionalImpact: { type: 'number' },
        structuralClarity: { type: 'number' }
      }
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          priority: { type: 'string' },
          area: { type: 'string' },
          suggestion: { type: 'string' }
        }
      }
    }
  }
}

const SHAPE_SYSTEM_PROMPT = `You are a narrative analyst. Analyze the provided manuscript and return structured JSON.

Classify the narrative arc type from the following: "Rags to Riches", "Overcoming the Monster", "Voyage and Return", "Comedy", "Tragedy", "Rebirth", or "Quest".

Assess pacing, detect recurring themes (up to 5), rate prose quality dimensions (1-10), and give actionable recommendations.

Respond ONLY with valid JSON matching this schema:
{
  "narrativeArc": {
    "type": "arc type label",
    "confidence": 0-100,
    "description": "one-sentence explanation"
  },
  "pacingAssessment": {
    "rating": "well-paced | slow start | rushes ending | uneven | consistently slow",
    "strengths": ["..."],
    "concerns": ["..."]
  },
  "themes": [
    { "theme": "theme name", "relevance": 0-100, "evidence": "brief quote or observation" }
  ],
  "qualityMetrics": {
    "sensoryDetail": 1-10,
    "dialogueNaturalness": 1-10,
    "showVsTell": 1-10,
    "emotionalImpact": 1-10,
    "structuralClarity": 1-10
  },
  "recommendations": [
    { "priority": "high | medium | low", "area": "target aspect", "suggestion": "actionable advice" }
  ]
}`

export function useAIShapeAnalyzer() {
  const isAnalyzing = ref(false)

  async function runAIAnalysis(text) {
    if (!text || text.trim().length === 0) return null

    isAnalyzing.value = true
    try {
      const excerpt = text.slice(0, 8000)
      const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length

      const userPrompt = `Manuscript excerpt (${wordCount} total words, showing first ~8000 chars):

${excerpt}

Analyze the narrative structure, pacing, themes, prose quality, and provide recommendations.`

      const parsed = await aiGenerateJson(userPrompt, SHAPE_SYSTEM_PROMPT, {
        feature: FEATURES.SHAPE_ANALYSIS,
        temperature: 0.3,
        maxTokens: 1500,
        schema: SHAPE_ANALYSIS_SCHEMA,
        schemaName: 'shape_analysis'
      }).catch(() => null)

      if (!parsed) return null

      return {
        narrativeArc: parsed.narrativeArc || null,
        pacingAssessment: parsed.pacingAssessment || null,
        themes: Array.isArray(parsed.themes) ? parsed.themes : [],
        qualityMetrics: parsed.qualityMetrics || null,
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
      }
    } catch {
      return null
    } finally {
      isAnalyzing.value = false
    }
  }

  return { runAIAnalysis, isAnalyzing }
}
