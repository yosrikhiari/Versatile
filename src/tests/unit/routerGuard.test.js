import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'

// The views are irrelevant to the guard and heavy to load.
vi.mock('@/views/LoginView.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/WorkspaceView.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/ManageOrganizationView.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/EditorView.vue', () => ({ default: { render: () => null } }))

// The guard returns its redirect instead of calling next(), which vue-router 5
// deprecates (VUE_ROUTER_R0025). The routing it does must not change.
describe('router guard', () => {
  let router
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.resetModules()
    router = (await import('@/router/index')).default
  })

  it('sends a signed-out visitor to the login page', async () => {
    await router.push('/editor/1')
    expect(router.currentRoute.value.path).toBe('/login')
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('lets a signed-in writer through, and away from the login page', async () => {
    useAuthStore().localUser = { id: 1, username: 'writer', displayName: 'Writer' }
    await router.push('/editor/1')
    expect(router.currentRoute.value.path).toBe('/editor/1')
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/workspace')
  })

  it('does not warn about the deprecated next() callback', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await router.push('/editor/1')
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/R0025|next\(\) callback/)
    warn.mockRestore()
  })
})
