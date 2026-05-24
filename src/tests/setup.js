import { vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach } from 'vitest'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})
