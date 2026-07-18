const BASE_URL = '/api'
const TOKEN_KEY = 'versatile_api_token'
const REFRESH_KEY = 'versatile_api_refresh'

let onLogout = null

export function setOnLogout(handler) {
  onLogout = handler
}

/** Returns Bearer token from localStorage (legacy) — cookie is sent automatically by the browser. */
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

function getActiveOrgId() {
  try {
    const store = window.__PINIA__?.state?.value?.auth
    return store?.activeOrganization?.id || null
  } catch {
    return null
  }
}

/**
 * Returns Authorization headers if a token exists in storage.
 * Used by providerRegistry.ts to authenticate backend API key fetch.
 */
export function getAuthHeaders() {
  const token = getToken()
  const headers = token ? { Authorization: 'Bearer ' + token } : {}
  const orgId = getActiveOrgId()
  if (orgId) headers['X-Organization-Id'] = orgId
  return headers
}

async function tryRefresh() {
  // Refresh endpoint reads the refresh_token from the HttpOnly cookie,
  // but also accepts a body fallback for localStorage clients.
  const refresh = getRefreshToken()
  try {
    const res = await fetch(BASE_URL + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh || '' })
    })
    if (!res.ok) return false
    const data = await res.json()
    if (data.token) setToken(data.token)
    if (data.refreshToken) setRefreshToken(data.refreshToken)
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

export async function api(path, options) {
  options = options || {}
  var body = options.body
  var method = options.method || 'GET'
  var headers = options.headers || {}
  var auth = options.auth !== false

  var requestHeaders = Object.assign({}, headers)
  if (body && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  if (auth) {
    var token = getToken()
    if (token) {
      requestHeaders['Authorization'] = 'Bearer ' + token
      var orgId = getActiveOrgId()
      if (orgId) requestHeaders['X-Organization-Id'] = orgId
    }
  }

  var fetchOptions = {
    method: method,
    headers: requestHeaders,
    signal: options.signal
  }
  if (body) {
    fetchOptions.body = body instanceof FormData ? body : JSON.stringify(body)
  }

  var response = await fetch(BASE_URL + path, fetchOptions)

  if (response.status === 401 && auth) {
    var refreshed = await tryRefresh()
    if (refreshed) {
      requestHeaders['Authorization'] = 'Bearer ' + getToken()
      var orgId = getActiveOrgId()
      if (orgId) requestHeaders['X-Organization-Id'] = orgId
      response = await fetch(BASE_URL + path, fetchOptions)
    } else {
      clearAuth()
      throw new ApiError('Session expired. Please log in again.', 401)
    }
  }

  if (!response.ok) {
    var errorBody = await response.json().catch(function () {
      return null
    })
    var message =
      (errorBody && errorBody.message) ||
      (errorBody && errorBody.title) ||
      'Request failed: ' + response.status
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
    list: function (params) {
      var qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return api(prefix + qs)
    },
    get: function (id) {
      return api(prefix + '/' + id)
    },
    create: function (data) {
      return api(prefix, { method: 'POST', body: data })
    },
    update: function (id, data) {
      return api(prefix + '/' + id, { method: 'PUT', body: data })
    },
    del: function (id) {
      return api(prefix + '/' + id, { method: 'DELETE' })
    }
  }
}

export function storyApi(storyId) {
  var base = '/story/' + storyId
  return {
    list: crud(base).list,
    get: crud(base).get,
    create: crud(base).create,
    update: crud(base).update,
    del: crud(base).del,
    chapters: crud(base + '/chapter'),
    entities: crud(base + '/entity'),
    flows: crud(base + '/flow'),
    research: crud(base + '/research'),
    bible: crud(base + '/bible')
  }
}

export function chapterApi(chapterId) {
  return {
    list: crud('/chapter/' + chapterId).list,
    get: crud('/chapter/' + chapterId).get,
    create: crud('/chapter/' + chapterId).create,
    update: crud('/chapter/' + chapterId).update,
    del: crud('/chapter/' + chapterId).del,
    scenes: crud('/chapter/' + chapterId + '/scene')
  }
}

export function sceneApi(sceneId) {
  return crud('/scene/' + sceneId)
}

export function entityApi(entityId) {
  return crud('/entity/' + entityId)
}

export function flowApi(flowId) {
  return crud('/flow/' + flowId)
}

export function researchApi(researchId) {
  return crud('/research/' + researchId)
}

export function bibleApi(bibleId) {
  return crud('/bible/' + bibleId)
}
