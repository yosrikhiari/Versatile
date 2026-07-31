import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, hasToken, setAuth, clearAuth, setOnLogout } from '../services/api'
import { getSyncEngine, destroySyncEngine } from '../services/sync-engine'
import { disconnect as disconnectGeneration } from '../services/signalrService'
import { disconnect as disconnectCollaboration } from '../services/collaborationService'
import { db } from '../services/db-core'
import { sha256 } from '../utils/hash'
import { clearSessionCryptoKey } from '../services/ollamaService'

const LOCAL_USER_KEY = 'versatile_local_user'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<any | null>(null)
  const token = ref<any | null>(null)
  const loading = ref(false)
  const error = ref<any | null>(null)
  const localUser = ref<any | null>(null)
  const organizations = ref<any[]>([])
  const activeOrganization = ref<any | null>(null)

  const isAuthenticated = computed(() => !!token.value || hasToken() || !!localUser.value)

  function parseOrgs(payload: any) {
    if (!payload.orgs) return []
    try {
      return typeof payload.orgs === 'string' ? JSON.parse(payload.orgs) : payload.orgs
    } catch {
      return []
    }
  }

  async function hydrate() {
    const stored = localStorage.getItem(LOCAL_USER_KEY)
    if (stored) {
      try {
        localUser.value = JSON.parse(stored)
        return
      } catch {
        localStorage.removeItem(LOCAL_USER_KEY)
      }
    }
    if (hasToken()) {
      const payload = parseJwt(localStorage.getItem('versatile_api_token'))
      if (payload) {
        user.value = {
          id: payload.sub,
          username: payload.username,
          email: payload.email,
          displayName: payload.displayName
        }
        organizations.value = parseOrgs(payload)
        const currentOrgId = payload.org_id
        activeOrganization.value = organizations.value.find(o => o.id === currentOrgId) || organizations.value[0] || null
        const se = getSyncEngine()
        await se.init()
        se.syncNow().catch(() => {})
      }
    }
  }

  setOnLogout(() => {
    user.value = null
    token.value = null
    organizations.value = []
    activeOrganization.value = null
  })

  hydrate()

  async function register(data: any) {
    loading.value = true
    error.value = null
    try {
      const result: any = await api('/auth/register', {
        method: 'POST',
        body: data,
        auth: false
      })
      setAuth(result.token, result.refreshToken)
      token.value = result.token
      user.value = result.user
      organizations.value = result.organizations || []
      const payload = parseJwt(result.token)
      activeOrganization.value = organizations.value.find(o => o.id === payload?.org_id) || organizations.value[0] || null
      const se = getSyncEngine()
      await se.init()
      se.syncNow().catch(() => {})
      return result
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function login(data: any) {
    loading.value = true
    error.value = null
    try {
      const result: any = await api('/auth/login', {
        method: 'POST',
        body: data,
        auth: false
      })
      setAuth(result.token, result.refreshToken)
      token.value = result.token
      user.value = result.user
      organizations.value = result.organizations || []
      const payload = parseJwt(result.token)
      activeOrganization.value = organizations.value.find(o => o.id === payload?.org_id) || organizations.value[0] || null
      const se = getSyncEngine()
      await se.init()
      se.syncNow().catch(() => {})
      return result
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function switchOrg(orgId: any) {
    loading.value = true
    error.value = null
    disconnectGeneration().catch(() => {})
    disconnectCollaboration().catch(() => {})
    try {
      const result: any = await api('/auth/switch-org', {
        method: 'POST',
        body: { organizationId: orgId }
      })
      setAuth(result.token, result.refreshToken)
      token.value = result.token
      organizations.value = result.organizations || []
      const payload = parseJwt(result.token)
      activeOrganization.value = organizations.value.find(o => o.id === payload?.org_id) || null
      return result
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function localLogin(username: any, password: any) {
    loading.value = true
    error.value = null
    try {
      const passwordHash = await sha256(password)
      const found = await (db as any).users.where('username').equals(username).first()
      if (!found || found.passwordHash !== passwordHash) {
        throw new Error('Invalid username or password')
      }
      const session = {
        id: found.id,
        username: found.username,
        displayName: found.displayName
      }
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(session))
      localUser.value = session
      return session
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function localRegister(username: any, password: any, displayName: any) {
    loading.value = true
    error.value = null
    try {
      const existing = await (db as any).users.where('username').equals(username).first()
      if (existing) {
        throw new Error('Username already taken')
      }
      const passwordHash = await sha256(password)
      const id = await (db as any).users.add({
        username,
        passwordHash,
        displayName: displayName || username,
        createdAt: new Date().toISOString()
      })
      const session = { id, username, displayName: displayName || username }
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(session))
      localUser.value = session
      return session
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    if (localUser.value) {
      localStorage.removeItem(LOCAL_USER_KEY)
      localUser.value = null
      return
    }
    disconnectGeneration().catch(() => {})
    disconnectCollaboration().catch(() => {})
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch (err: any) {
      console.warn('[authStore] Logout request failed; clearing local auth anyway:', err)
    }
    clearSessionCryptoKey()
    clearAuth()
    destroySyncEngine()
    user.value = null
    token.value = null
    organizations.value = []
    activeOrganization.value = null
  }

  return {
    user,
    token,
    loading,
    error,
    localUser,
    organizations,
    activeOrganization,
    isAuthenticated,
    login,
    register,
    localLogin,
    localRegister,
    switchOrg,
    logout,
    hydrate
  }
})

function parseJwt(token: any) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(
      decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
    )
  } catch {
    return null
  }
}
