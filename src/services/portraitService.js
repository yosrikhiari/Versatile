import { ollamaGenerate } from './ollamaService'
import { updateCharacterPortrait } from './dbService'

const SD_API_BASE = '/sdapi/v1'

const SD_DEFAULTS = {
  steps: 20,
  width: 512,
  height: 512,
  cfg_scale: 7,
  sampler_name: 'Euler a',
  n_iter: 1,
  batch_size: 1
}

const NEGATIVE_PROMPT =
  'anime, bad hands, bad anatomy, blurry, low quality, worst quality, deformed, disfigured, watermark, text, signature, ugly, poorly drawn, extra digits, extra limbs, fused fingers, too many fingers, long neck, cross-eyed'

export async function generateSDPrompt(character) {
  const systemPrompt = `You are an SD prompt engineer. Given character details, output ONLY a high-quality Stable Diffusion prompt (no explanation, no quotes).

Rules:
- Output ONLY the positive prompt, optimized for camelliamix_v3 style
- Include quality tags: masterpiece, best quality, very aesthetic
- Describe physical appearance, clothing, expression, pose
- NO negative prompts, NO explanations, NO quotes around the output
- Keep it under 200 words`

  const userPrompt = `Character:
- Name: ${character.name || 'Unknown'}
- Role: ${character.role || 'Not specified'}
- Goal: ${character.goal || 'Not specified'}
- Voice: ${character.voice || 'Not specified'}
- Notes: ${character.notes || 'Not specified'}

Generate ONLY the SD prompt for this character portrait.`

  try {
    const prompt = await ollamaGenerate(userPrompt, systemPrompt)
    return prompt.trim()
  } catch (error) {
    console.error('Failed to generate SD prompt:', error)
    return buildFallbackPrompt(character)
  }
}

function buildFallbackPrompt(character) {
  const parts = ['masterpiece', 'best quality', 'very aesthetic', 'portrait']
  if (character.role) parts.push(character.role)
  if (character.name && character.name !== 'New Character') parts.push(character.name)
  return parts.join(', ')
}

export async function generatePortrait(character, projectId) {
  try {
    const prompt = await generateSDPrompt(character)

    const payload = {
      ...SD_DEFAULTS,
      prompt,
      negative_prompt: NEGATIVE_PROMPT
    }

    const response = await fetch(`${SD_API_BASE}/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `SD API error: ${response.status} ${errorText}` }
    }

    const data = await response.json()

    if (!data.images || !data.images[0]) {
      return { success: false, error: 'No image returned from SD API' }
    }

    const base64Image = data.images[0]
    const dataUrl = `data:image/png;base64,${base64Image}`

    if (character.id && projectId) {
      await updateCharacterPortrait(character.id, dataUrl)
    }

    return { success: true, dataUrl }
  } catch (error) {
    console.error('Portrait generation failed:', error)
    return { success: false, error: error.message }
  }
}
