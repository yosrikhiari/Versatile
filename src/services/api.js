const BASE_URL = '/api'
const TOKEN_KEY = 'versatile_api_token'
const REFRESH_KEY = 'versatile_api_refresh'

let onLogout = null

export function setOnLogout(handler) {
  onLogout = handler
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY)
}

function setRefreshToken(token) {
  localStorage.setItem(REFRESH_KEY, token)
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export function hasToken() {
  return !!getToken()
}

async function tryRefresh() {
  const refresh = getRefreshToken()
  if (!refresh) return false
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh })
    })
    if (!res.ok) return false
    const data = await res.json()
    setToken(data.token)
    setRefreshToken(data.refreshToken)
    return true
  } catch {
    return false
  }
}

export function setAuth(token, refreshToken) {
  setToken(token)
  setRefreshToken(refreshToken)
}

export function clearAuth() {
  clearTokens()
  if (onLogout) onLogout()
}

export async function api(path, options = {}) {
  const { body, method = 'GET', headers = {}, auth = true } = options

  const requestHeaders = { ...headers }
  if (body && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = getToken()
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`
    }
  }

  const fetchOptions = {
    method,
    headers: requestHeaders,
    signal: options.signal
  }
  if (body) {
    fetchOptions.body = body instanceof FormData ? body : JSON.stringify(body)
  }

  let response = await fetch(`${BASE_URL}${path}`, fetchOptions)

  if (response.status === 401 && auth) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      requestHeaders['Authorization'] = `Bearer ${getToken()}`
      response = await fetch(`${BASE_URL}${path}`, fetchOptions)
    } else {
      clearAuth()
      throw new ApiError('Session expired. Please log in again.', 401)
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const message = errorBody?.message || errorBody?.title || `Request failed: ${response.status}`
    throw new ApiError(message, response.status, errorBody)
  }

  if (response.status === 204) return null
  return await response.json()
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function crud(prefix) {
  return {
    list: (params) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return api(`${prefix}${qs}`)
    },
    get: (id) => api(`${prefix}/${id}`),
    create: (data) => api(prefix, { method: 'POST', body: data }),
    update: (id, data) => api(`${prefix}/${id}`, { method: 'PUT', body: data }),
    delete: (id) => api(`${prefix}/${id}`, { method: 'DELETE' })
  }
}

export function storyApi(storyId) {
  const base = `/story/${storyId}`
  return {
    ...crud(base),
    chapters: crud(`${base}/chapter`),
    entities: crud(`${base}/entity`),
    flows: crud(`${base}/flow`),
    research: crud(`${base}/research`),
    bible: crud(`${base}/bible`)
  }
}

export function chapterApi(chapterId) {
  return {
    ...crud(`/chapter/${chapterId}`),
    scenes: crud(`/chapter/${chapterId}/scene`)
  }
}

export function sceneApi(sceneId) {
  return crud(`/scene/${sceneId}`)
}

export function entityApi(entityId) {
  return crud(`/entity/${entityId}`)
}

export function flowApi(flowId) {
  return crud(`/flow/${flowId}`)
}

export function researchApi(researchId) {
  return crud(`/research/${researchId}`)
}

export function bibleApi(bibleId) {
  return crud(`/bible/${bibleId}`)
}
