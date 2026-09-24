import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * The benchmark's judge must not silently be the model under test. Before
 * `JUDGE_MODEL` existed the local fallback read `OLLAMA_MODEL`, so phi4-mini
 * graded phi4-mini and the report looked like an independent score.
 */
async function load(env) {
  for (const key of [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GROQ_API_KEY',
    'JUDGE_PROVIDER',
    'JUDGE_MODEL',
    'OLLAMA_MODEL',
    'OLLAMA_MODELS'
  ]) {
    vi.stubEnv(key, env[key] ?? '')
  }
  vi.resetModules()
  return import('../../../scripts/ml-pipelines/model-benchmarking/providers.js')
}

describe('benchmark judge selection', () => {
  beforeEach(() => vi.unstubAllEnvs())
  afterEach(() => vi.unstubAllEnvs())

  it('with no keys, judges locally with a model other than the one under test', async () => {
    const { selectJudge, DEFAULT_OLLAMA_JUDGE } = await load({ OLLAMA_MODEL: 'phi4-mini:3.8b' })
    const judge = selectJudge()
    expect(judge.providerId).toBe('ollama')
    expect(judge.model).toBe(DEFAULT_OLLAMA_JUDGE)
    expect(judge.model).not.toBe('phi4-mini:3.8b')
    expect(judge.selfJudged).toBe(false)
  })

  it('flags a judge that is also under test instead of hiding it', async () => {
    const { selectJudge } = await load({
      OLLAMA_MODEL: 'phi4-mini:3.8b',
      JUDGE_MODEL: 'phi4-mini:3.8b'
    })
    expect(selectJudge().selfJudged).toBe(true)
  })

  it('checks every model in a multi-model run', async () => {
    const { selectJudge } = await load({ OLLAMA_MODELS: 'qwen3:8b,phi4-mini:3.8b' })
    // the default judge is one of the contestants here
    expect(selectJudge().selfJudged).toBe(true)
  })

  it('prefers a keyed remote provider, and flags it when it is also a contestant', async () => {
    // Every remote default judge is also one of that provider's benchmarked
    // models (Groq benchmarks llama-3.3-70b AND judges with it). The first
    // version of this test assumed otherwise; the flag was right.
    const { selectJudge } = await load({ GROQ_API_KEY: 'gsk_test' })
    const judge = selectJudge()
    expect(judge.providerId).toBe('groq')
    expect(judge.model).toBe('llama-3.3-70b-versatile')
    expect(judge.selfJudged).toBe(true)
  })

  it('JUDGE_MODEL takes the remote judge out of the contest', async () => {
    const { selectJudge } = await load({ GROQ_API_KEY: 'gsk_test', JUDGE_MODEL: 'qwen/qwen3-32b' })
    expect(selectJudge()).toMatchObject({
      providerId: 'groq',
      model: 'qwen/qwen3-32b',
      selfJudged: false
    })
  })
})
