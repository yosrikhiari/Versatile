import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  groq: 'https://api.groq.com/openai/v1',
  ollama: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434'
}

const PROVIDER_CONFIGS = [
  {
    id: 'openai',
    label: 'OpenAI',
    model: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
    supportsStreaming: true
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    model: 'claude-sonnet-4-20250514',
    envKey: 'ANTHROPIC_API_KEY',
    supportsStreaming: true
  },
  {
    id: 'gemini',
    label: 'Gemini',
    model: 'gemini-2.5-flash',
    envKey: 'GEMINI_API_KEY',
    supportsStreaming: true
  },
  {
    id: 'groq',
    label: 'Groq',
    model: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
    supportsStreaming: true
  },
  {
    id: 'ollama',
    label: 'Ollama',
    model: process.env.OLLAMA_MODEL || 'phi4-mini:3.8b',
    envKey: null,
    supportsStreaming: true,
    isLocal: true
  }
]

const COST_TABLE = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.5-pro': { input: 1.25, output: 5 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 }
}

function makeTimeout(timeoutMs = 120000) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error(`TIMEOUT after ${timeoutMs}ms`)),
    timeoutMs
  )
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) }
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

function estimateCost(model, promptTokens, outputTokens) {
  const rates = COST_TABLE[model]
  if (!rates) return null
  const inputCost = (promptTokens / 1000) * rates.input
  const outputCost = (outputTokens / 1000) * rates.output
  return +(inputCost + outputCost).toFixed(6)
}

export function getAvailableProviders() {
  return PROVIDER_CONFIGS.filter((cfg) => {
    if (cfg.id === 'ollama') return true
    return !!process.env[cfg.envKey]
  })
}

export function expandModelVariants(providers) {
  const result = []
  for (const p of providers) {
    if (p.id === 'ollama') {
      const models = process.env.OLLAMA_MODELS
      if (models) {
        const modelList = models
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
        for (const m of modelList) {
          result.push({ ...p, id: `ollama:${m}`, model: m, label: `Ollama (${m})` })
        }
      } else {
        result.push(p)
      }
    } else {
      result.push(p)
    }
  }
  return result
}

async function timeProviderCall(fn) {
  const start = performance.now()
  try {
    const output = await fn()
    const elapsed = +(performance.now() - start).toFixed(0)
    return { output, elapsedMs: elapsed, error: null }
  } catch (err) {
    const elapsed = +(performance.now() - start).toFixed(0)
    return { output: null, elapsedMs: elapsed, error: err.message || String(err) }
  }
}

async function callOpenAI(prompt, systemPrompt, model) {
  const { signal, cleanup } = makeTimeout()
  try {
    const resp = await fetch(`${PROVIDER_BASE_URLS.openai}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4096
      })
    })
    cleanup()
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || `OpenAI error: ${resp.status}`)
    }
    const data = await resp.json()
    return data.choices[0]?.message?.content || ''
  } catch (err) {
    cleanup()
    throw err
  }
}

async function callAnthropic(prompt, systemPrompt, model) {
  const { signal, cleanup } = makeTimeout()
  try {
    const resp = await fetch(`${PROVIDER_BASE_URLS.anthropic}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      signal,
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
        temperature: 0.7
      })
    })
    cleanup()
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || `Anthropic error: ${resp.status}`)
    }
    const data = await resp.json()
    return data.content?.[0]?.text || ''
  } catch (err) {
    cleanup()
    throw err
  }
}

async function callGemini(prompt, systemPrompt, model) {
  const contents = []
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] })
    contents.push({ role: 'model', parts: [{ text: 'Understood.' }] })
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] })

  const { signal, cleanup } = makeTimeout()
  try {
    const url = `${PROVIDER_BASE_URLS.gemini}/models/${model}:generateContent`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY
      },
      signal,
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
      })
    })
    cleanup()
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || `Gemini error: ${resp.status}`)
    }
    const data = await resp.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } catch (err) {
    cleanup()
    throw err
  }
}

async function callGroq(prompt, systemPrompt, model) {
  const { signal, cleanup } = makeTimeout()
  try {
    const resp = await fetch(`${PROVIDER_BASE_URLS.groq}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4096
      })
    })
    cleanup()
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || `Groq error: ${resp.status}`)
    }
    const data = await resp.json()
    return data.choices[0]?.message?.content || ''
  } catch (err) {
    cleanup()
    throw err
  }
}

async function callOllama(prompt, systemPrompt, model) {
  const m = model || 'phi4-mini'
  const { signal, cleanup } = makeTimeout(300000)
  try {
    const resp = await fetch(`${PROVIDER_BASE_URLS.ollama}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: m,
        system: systemPrompt,
        prompt,
        stream: false,
        options: { temperature: 0.7, num_predict: 4096 }
      })
    })
    cleanup()
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error || `Ollama error: ${resp.status}`)
    }
    const data = await resp.json()
    return data.response
  } catch (err) {
    cleanup()
    throw err
  }
}

const PROVIDER_DISPATCH = {
  openai: callOpenAI,
  anthropic: callAnthropic,
  gemini: callGemini,
  groq: callGroq,
  ollama: callOllama
}

const JUDGE_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-3-5-20241022',
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  ollama: null
}

export function selectJudge() {
  const override = process.env.JUDGE_PROVIDER
  if (override) {
    const baseId = override.split(':')[0]
    if (PROVIDER_DISPATCH[baseId]) {
      return {
        providerId: override,
        model: JUDGE_MODELS[baseId] || PROVIDER_CONFIGS.find((p) => p.id === baseId)?.model
      }
    }
  }

  const priority = ['anthropic', 'openai', 'gemini', 'groq', 'ollama']
  for (const pid of priority) {
    const cfg = PROVIDER_CONFIGS.find((p) => p.id === pid)
    if (!cfg) continue
    if (pid === 'ollama') {
      return { providerId: 'ollama', model: process.env.OLLAMA_MODEL || 'phi4-mini:3.8b' }
    }
    if (process.env[cfg.envKey]) {
      return { providerId: pid, model: JUDGE_MODELS[pid] || cfg.model }
    }
  }
  return null
}

export async function callModel(providerId, prompt, systemPrompt, model) {
  const baseId = providerId.split(':')[0]
  const fn = PROVIDER_DISPATCH[baseId]
  if (!fn) throw new Error(`Unknown provider: ${providerId}`)
  return fn(prompt, systemPrompt, model)
}

export async function runTest(providerId, prompt, systemPrompt, model) {
  const baseId = providerId.split(':')[0]
  const fn = PROVIDER_DISPATCH[baseId]
  if (!fn) throw new Error(`Unknown provider: ${providerId}`)
  const start = performance.now()
  const result = await timeProviderCall(() => fn(prompt, systemPrompt, model))
  const output = result.output
  const wordCount = output ? output.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = output ? output.length : 0
  const outputTokens = estimateTokens(charCount)
  const inputTokens = estimateTokens(systemPrompt.length + prompt.length)

  const cfg = PROVIDER_CONFIGS.find((p) => p.id === baseId)
  const modelName = model || cfg?.model || 'unknown'

  return {
    provider: providerId,
    model: modelName,
    output,
    wordCount,
    charCount,
    latencyMs: result.elapsedMs,
    inputTokens,
    outputTokens,
    estimatedCost: estimateCost(modelName, inputTokens, outputTokens),
    error: result.error
  }
}
