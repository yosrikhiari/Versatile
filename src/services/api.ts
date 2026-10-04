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
    const data = unwrapEnvelope(await res.json()) as { token?: string; refreshToken?: string }
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
    const errorBody = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const message =
      (errorBody?.message as string) ||
      (errorBody?.title as string) ||
      'Request failed: ' + response.status
    const retryAfter = Number(response.headers.get('Retry-After'))
    throw new ApiError(
      message,
      response.status,
      errorBody,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
    )
  }

  if (response.status === 204) return null
  return unwrapEnvelope(await response.json()) as T
}

/**
 * The backend wraps every 2xx object result as `{ data, message }`
 * (`ResponseEnvelopeFilter`). Callers want the payload: before this, login read
 * `result.token`, sync read `result.id`, and both got `undefined`.
 */
export function unwrapEnvelope(body: unknown): unknown {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    const keys = Object.keys(body)
    if (keys.every((k) => k === 'data' || k === 'message')) {
      return (body as { data: unknown }).data
    }
  }
  return body
}

export class ApiError extends Error {
  name = 'ApiError'
  status: number
  body: Record<string, unknown> | null
  /** Seconds the server asked us to wait (429 `Retry-After`). */
  retryAfter?: number

  constructor(
    message: string,
    status: number,
    body?: Record<string, unknown> | null,
    retryAfter?: number
  ) {
    super(message)
    this.status = status
    this.body = body ?? null
    this.retryAfter = retryAfter
  }
}
