import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { useCharacterChatStore } = await import('@/stores/characterChatStore')

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('character chat modal claim', () => {
  it('starts unclaimed and records the owning surface', () => {
    const chatStore = useCharacterChatStore()
    expect(chatStore.modalClaim).toBeNull()
    chatStore.claimChatModal('bible')
    expect(chatStore.modalClaim).toBe('bible')
    chatStore.claimChatModal(null)
    expect(chatStore.modalClaim).toBeNull()
  })
})
