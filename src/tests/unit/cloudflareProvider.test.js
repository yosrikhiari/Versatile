import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Cloudflare provider', () => {
  beforeEach(() => {
    vi.resetModules()
    global.fetch = vi.fn()
  })

  it('generate throws without API token', async () => {
    const { generate } = await import('../../services/providers/cloudflare')
    await expect(
      generate('p', 's', '@cf/meta/llama-3.1-8b-instruct', { accountId: 'acct' })
    ).rejects.toThrow('API token not configured')
  })

  it('generate throws without account ID', async () => {
    const { generate } = await import('../../services/providers/cloudflare')
    await expect(
      generate('p', 's', '@cf/meta/llama-3.1-8b-instruct', { apiKey: 'cf-test' })
    ).rejects.toThrow('account ID not configured')
  })

  it('generate posts to the account run URL and returns the response text', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ result: { response: 'Hello' }, success: true, errors: [], messages: [] })
    })
    const { generate } = await import('../../services/providers/cloudflare')
    const result = await generate('test', 'sys', '@cf/meta/llama-3.1-8b-instruct', {
      apiKey: 'cf-test',
      accountId: 'acct123'
    })
    expect(result).toEqual({ text: 'Hello', usage: null })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/acct123/ai/run/@cf/meta/llama-3.1-8b-instruct',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('generate throws the Cloudflare error message on failure', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ success: false, errors: [{ message: 'Forbidden' }] })
    })
    const { generate } = await import('../../services/providers/cloudflare')
    await expect(
      generate('test', 'sys', '@cf/meta/llama-3.1-8b-instruct', {
        apiKey: 'cf-test',
        accountId: 'acct123'
      })
    ).rejects.toThrow('Forbidden')
  })

  it('testConnection returns false without credentials', async () => {
    const { testConnection } = await import('../../services/providers/cloudflare')
    expect(await testConnection('', '')).toBe(false)
    expect(await testConnection('cf-test')).toBe(false)
  })

  it('testConnection returns true when the probe succeeds', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ result: { response: 'ping' }, success: true, errors: [], messages: [] })
    })
    const { testConnection } = await import('../../services/providers/cloudflare')
    expect(await testConnection('cf-test', 'acct123')).toBe(true)
  })

  it('testConnection returns false on network error', async () => {
    global.fetch.mockRejectedValue(new Error('fail'))
    const { testConnection } = await import('../../services/providers/cloudflare')
    expect(await testConnection('cf-test', 'acct123')).toBe(false)
  })
})
