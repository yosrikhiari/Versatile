import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../stores/projectStore', () => ({
  useProjectStore: vi.fn(() => ({
    authorVoiceProfile: null
  }))
}))

describe('useAuthorModel', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function create() {
    const mod = await import('../../composables/useAuthorModel')
    return mod.useAuthorModel()
  }

  describe('buildProfileFromSession', () => {
    it('creates default profile for first session', async () => {
      const { buildProfileFromSession } = await create()
      const result = buildProfileFromSession({ wordCountDelta: 500 })
      expect(result.sessionCount).toBe(1)
      expect(result.totalWordsWritten).toBe(500)
      expect(result.favoriteLenses).toEqual([])
    })

    it('increments session count', async () => {
      const { buildProfileFromSession } = await create()
      const first = buildProfileFromSession({ wordCountDelta: 100 })
      expect(first.sessionCount).toBe(1)
    })

    it('adds accepted lenses', async () => {
      const { buildProfileFromSession } = await create()
      const result = buildProfileFromSession({ acceptedLenses: ['style', 'plot'] })
      expect(result.favoriteLenses).toContain('style')
      expect(result.favoriteLenses).toContain('plot')
    })

    it('adds rejected lenses', async () => {
      const { buildProfileFromSession } = await create()
      const result = buildProfileFromSession({ rejectedLenses: ['grammar'] })
      expect(result.rejectedLenses).toContain('grammar')
    })

    it('deduplicates within a single session', async () => {
      const { buildProfileFromSession } = await create()
      const result = buildProfileFromSession({ acceptedLenses: ['style', 'plot', 'style'] })
      expect(result.favoriteLenses).toHaveLength(2)
      expect(result.favoriteLenses).toContain('style')
      expect(result.favoriteLenses).toContain('plot')
    })

    it('sets genre focus', async () => {
      const { buildProfileFromSession } = await create()
      const result = buildProfileFromSession({ genre: 'fantasy' })
      expect(result.genreFocus).toBe('fantasy')
    })

    it('adds spark type', async () => {
      const { buildProfileFromSession } = await create()
      const result = buildProfileFromSession({ sparkType: 'outline' })
      expect(result.sparkTypesUsed).toContain('outline')
    })

    it('sets tone', async () => {
      const { buildProfileFromSession } = await create()
      const result = buildProfileFromSession({ tone: 'dark' })
      expect(result.preferredTone).toBe('dark')
    })

    it('adds strengths', async () => {
      const { buildProfileFromSession } = await create()
      const result = buildProfileFromSession({ strengths: ['dialogue', 'description'] })
      expect(result.commonStrengths).toContain('dialogue')
    })

    it('adds weaknesses', async () => {
      const { buildProfileFromSession } = await create()
      const result = buildProfileFromSession({ weaknesses: ['pacing'] })
      expect(result.commonWeaknesses).toContain('pacing')
    })
  })

  describe('profileToContextString', () => {
    it('returns empty for null', async () => {
      const { profileToContextString } = await create()
      expect(profileToContextString(null)).toBe('')
    })

    it('formats profile with all fields', async () => {
      const { profileToContextString } = await create()
      const profile = {
        genreFocus: 'fantasy',
        preferredTone: 'dark',
        favoriteLenses: ['style', 'plot'],
        commonStrengths: ['dialogue'],
        commonWeaknesses: ['pacing'],
        sessionCount: 5,
        totalWordsWritten: 10000
      }
      const result = profileToContextString(profile)
      expect(result).toContain('[Author Profile]')
      expect(result).toContain('Genre: fantasy')
      expect(result).toContain('Preferred tone: dark')
      expect(result).toContain('Writing sessions completed: 5')
      expect(result).toContain('Total words written: 10000')
    })

    it('handles profile.data wrapper', async () => {
      const { profileToContextString } = await create()
      const result = profileToContextString({
        data: { genreFocus: 'sci-fi', sessionCount: 3 }
      })
      expect(result).toContain('Genre: sci-fi')
    })

    it('returns empty when profile has no meaningful data', async () => {
      const { profileToContextString } = await create()
      const result = profileToContextString({})
      expect(result).toBe('')
    })
  })
})
