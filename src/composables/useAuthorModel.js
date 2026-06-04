import { useProjectStore } from '../stores/projectStore'

const DEFAULT_PROFILE = {
  favoriteLenses: [],
  rejectedLenses: [],
  preferredTone: '',
  genreFocus: '',
  sparkTypesUsed: [],
  commonStrengths: [],
  commonWeaknesses: [],
  sessionCount: 0,
  totalWordsWritten: 0
}

export function useAuthorModel() {
  const projectStore = useProjectStore()

  function buildProfileFromSession(sessionData) {
    const existing = projectStore.authorVoiceProfile?.data || { ...DEFAULT_PROFILE }
    const profile = { ...existing }

    profile.sessionCount = (profile.sessionCount || 0) + 1
    profile.totalWordsWritten = (profile.totalWordsWritten || 0) + (sessionData.wordCountDelta || 0)

    if (sessionData.genre) {
      profile.genreFocus = sessionData.genre
    }

    if (sessionData.acceptedLenses?.length > 0) {
      const current = new Set(profile.favoriteLenses || [])
      for (const lens of sessionData.acceptedLenses) {
        current.add(lens)
      }
      profile.favoriteLenses = [...current]
    }

    if (sessionData.rejectedLenses?.length > 0) {
      const current = new Set(profile.rejectedLenses || [])
      for (const lens of sessionData.rejectedLenses) {
        current.add(lens)
      }
      profile.rejectedLenses = [...current]
    }

    if (sessionData.sparkType) {
      const current = new Set(profile.sparkTypesUsed || [])
      current.add(sessionData.sparkType)
      profile.sparkTypesUsed = [...current]
    }

    if (sessionData.tone) {
      profile.preferredTone = sessionData.tone
    }

    if (sessionData.strengths) {
      const current = new Set(profile.commonStrengths || [])
      for (const s of sessionData.strengths) current.add(s)
      profile.commonStrengths = [...current]
    }

    if (sessionData.weaknesses) {
      const current = new Set(profile.commonWeaknesses || [])
      for (const w of sessionData.weaknesses) current.add(w)
      profile.commonWeaknesses = [...current]
    }

    return profile
  }

  function profileToContextString(profile) {
    if (!profile) return ''
    const p = profile.data || profile
    const parts = []
    if (p.genreFocus) parts.push(`Genre: ${p.genreFocus}`)
    if (p.preferredTone) parts.push(`Preferred tone: ${p.preferredTone}`)
    if (p.favoriteLenses?.length > 0) parts.push(`The author frequently uses these critique lenses: ${p.favoriteLenses.join(', ')}`)
    if (p.commonStrengths?.length > 0) parts.push(`The author's writing strengths: ${p.commonStrengths.join(', ')}`)
    if (p.commonWeaknesses?.length > 0) parts.push(`Areas the author is working on: ${p.commonWeaknesses.join(', ')}`)
    if (p.sessionCount) parts.push(`Writing sessions completed: ${p.sessionCount}`)
    if (p.totalWordsWritten) parts.push(`Total words written: ${p.totalWordsWritten}`)
    return parts.length > 0 ? `[Author Profile]\n${parts.join('\n')}` : ''
  }

  return {
    buildProfileFromSession,
    profileToContextString
  }
}
