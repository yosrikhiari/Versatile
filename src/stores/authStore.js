import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, hasToken, setAuth, clearAuth, setOnLogout } from '../services/api'
import { getSyncEngine, destroySyncEngine } from '../services/sync-engine'
import { db } from '../services/db-core'
import { sha256 } from '../utils/hash'

const LOCAL_USER_KEY = 'versatile_local_user'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const localUser = ref(null)

  const isAuthenticated = computed(() => !!token.value || hasToken() || !!localUser.value)

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
        const se = getSyncEngine()
        await se.init()
        se.syncNow().catch(() => {})
      }
    }
  }

  setOnLogout(() => {
    user.value = null
    token.value = null
  })

  hydrate()

  async function register(data) {
    loading.value = true
    error.value = null
    try {
      const result = await api('/auth/register', {
        method: 'POST',
        body: data,
        auth: false
      })
      setAuth(result.token, result.refreshToken)
      token.value = result.token
      user.value = result.user
      const se = getSyncEngine()
      await se.init()
      se.syncNow().catch(() => {})
      return result
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function login(data) {
    loading.value = true
    error.value = null
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: data,
        auth: false
      })
      setAuth(result.token, result.refreshToken)
      token.value = result.token
      user.value = result.user
      const se = getSyncEngine()
      await se.init()
      se.syncNow().catch(() => {})
      return result
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function localLogin(username, password) {
    loading.value = true
    error.value = null
    try {
      const passwordHash = await sha256(password)
      const found = await db.users.where('username').equals(username).first()
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
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function localRegister(username, password, displayName) {
    loading.value = true
    error.value = null
    try {
      const existing = await db.users.where('username').equals(username).first()
      if (existing) {
        throw new Error('Username already taken')
      }
      const passwordHash = await sha256(password)
      const id = await db.users.add({
        username,
        passwordHash,
        displayName: displayName || username,
        createdAt: new Date().toISOString()
      })
      const session = { id, username, displayName: displayName || username }
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(session))
      localUser.value = session
      return session
    } catch (err) {
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
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch {}
    clearAuth()
    destroySyncEngine()
    user.value = null
    token.value = null
  }

  return {
    user,
    token,
    loading,
    error,
    localUser,
    isAuthenticated,
    login,
    register,
    localLogin,
    localRegister,
    logout,
    hydrate
  }
})

function parseJwt(token) {
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
