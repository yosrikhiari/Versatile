import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'

vi.mock('../services/aiService', async () => {
  return await vi.importActual('../services/aiService')
})

setActivePinia(createPinia())
