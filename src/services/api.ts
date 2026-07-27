const BASE_URL = '/api'
const TOKEN_KEY = 'versatile_api_token'
const REFRESH_KEY = 'versatile_api_refresh'

let onLogout: (() => void) | null = null

export function setOnLogout(handler: () => void) {
  onLogout = handler
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

function setRefreshToken(token: string) {
  localStorage.setItem(REFRESH_KEY, token)
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export function hasToken(): boolean {
  return !!getToken()
}

function getActiveOrgId(): string | null {
  try {
    const store = (window as any).__PINIA__?.state?.value?.auth
    return store?.activeOrganization?.id || null
  } catch {
    return null
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken()
  const headers: Record<string, string> = token ? { Authorization: 'Bearer ' + token } : {}
  const orgId = getActiveOrgId()
  if (orgId) headers['X-Organization-Id'] = orgId
  return headers
}

async function tryRefresh(): Promise<boolean> {
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

export function setAuth(token: string, refreshToken: string) {
  setToken(token)
  setRefreshToken(refreshToken)
}

export function clearAuth() {
  clearTokens()
  if (onLogout) onLogout()
}

export interface ApiOptions {
  body?: unknown
  method?: string
  headers?: Record<string, string>
  auth?: boolean
  signal?: AbortSignal
}

export async function api<T = unknown>(path: string, options?: ApiOptions): Promise<T | null> {
  options = options || {}
  const body = options.body
  const method = options.method || 'GET'
  const headers = options.headers || {}
  const auth = options.auth !== false

  const requestHeaders: Record<string, string> = { ...headers }
  if (body && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = getToken()
    if (token) {
      requestHeaders['Authorization'] = 'Bearer ' + token
      const orgId = getActiveOrgId()
      if (orgId) requestHeaders['X-Organization-Id'] = orgId
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders
  }
  if (options.signal) {
    fetchOptions.signal = options.signal
  }
  if (body) {
    fetchOptions.body = body instanceof FormData ? body : JSON.stringify(body)
  }

  let response = await fetch(BASE_URL + path, fetchOptions)

  if (response.status === 401 && auth) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      requestHeaders['Authorization'] = 'Bearer ' + getToken()
      const orgId = getActiveOrgId()
      if (orgId) requestHeaders['X-Organization-Id'] = orgId
      response = await fetch(BASE_URL + path, fetchOptions)
    } else {
      clearAuth()
      throw new ApiError('Session expired. Please log in again.', 401)
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as Record<string, unknown> | null
    const message =
      (errorBody?.message as string) ||
      (errorBody?.title as string) ||
      'Request failed: ' + response.status
    throw new ApiError(message, response.status, errorBody)
  }

  if (response.status === 204) return null
  return await response.json() as T
}

export class ApiError extends Error {
  name = 'ApiError'
  status: number
  body: Record<string, unknown> | null

  constructor(message: string, status: number, body?: Record<string, unknown> | null) {
    super(message)
    this.status = status
    this.body = body ?? null
  }
}

interface CrudApi {
  list(params?: Record<string, string>): Promise<unknown>
  get(id: string): Promise<unknown>
  create(data: unknown): Promise<unknown>
  update(id: string, data: unknown): Promise<unknown>
  del(id: string): Promise<unknown>
}

function crud(prefix: string): CrudApi {
  return {
    list(params?: Record<string, string>) {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return api(prefix + qs)
    },
    get(id: string) {
      return api(prefix + '/' + id)
    },
    create(data: unknown) {
      return api(prefix, { method: 'POST', body: data })
    },
    update(id: string, data: unknown) {
      return api(prefix + '/' + id, { method: 'PUT', body: data })
    },
    del(id: string) {
      return api(prefix + '/' + id, { method: 'DELETE' })
    }
  }
}

export interface StoryApi extends CrudApi {
  chapters: CrudApi
  entities: CrudApi
  flows: CrudApi
  research: CrudApi
  bible: CrudApi
}

export function storyApi(storyId: string): StoryApi {
  const base = '/story/' + storyId
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

export interface ChapterApi extends CrudApi {
  scenes: CrudApi
}

export function chapterApi(chapterId: string): ChapterApi {
  return {
    list: crud('/chapter/' + chapterId).list,
    get: crud('/chapter/' + chapterId).get,
    create: crud('/chapter/' + chapterId).create,
    update: crud('/chapter/' + chapterId).update,
    del: crud('/chapter/' + chapterId).del,
    scenes: crud('/chapter/' + chapterId + '/scene')
  }
}

export function sceneApi(sceneId: string): CrudApi {
  return crud('/scene/' + sceneId)
}

export function entityApi(entityId: string): CrudApi {
  return crud('/entity/' + entityId)
}

export function flowApi(flowId: string): CrudApi {
  return crud('/flow/' + flowId)
}

export function researchApi(researchId: string): CrudApi {
  return crud('/research/' + researchId)
}

export function bibleApi(bibleId: string): CrudApi {
  return crud('/bible/' + bibleId)
}
