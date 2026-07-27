import * as signalR from '@microsoft/signalr'

const HUB_URL = '/hubs/collaboration'
const TOKEN_KEY = 'versatile_api_token'

let connection: signalR.HubConnection | null = null
let connectionPromise: Promise<signalR.HubConnection> | null = null

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getConnectionState(): signalR.HubConnectionState {
  if (!connection) return signalR.HubConnectionState.Disconnected
  return connection.state
}

export async function ensureConnection(): Promise<signalR.HubConnection> {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    return connection
  }

  if (connectionPromise) return connectionPromise

  connection = new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL, {
      accessTokenFactory: getToken
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .configureLogging(signalR.LogLevel.Warning)
    .build()

  connection.onreconnecting(() => {
    connectionPromise = null
  })

  connection.onclose(() => {
    connection = null
    connectionPromise = null
  })

  // `.start()` resolves to void, but the early-return above hands this promise
  // straight back to concurrent callers — who expect the connection itself.
  const started = connection
  connectionPromise = connection.start().then(() => started)
  try {
    await connectionPromise
    connectionPromise = null
    return connection
  } catch (err) {
    connection = null
    connectionPromise = null
    throw err
  }
}

export async function disconnect(): Promise<void> {
  if (connection) {
    await connection.stop()
    connection = null
    connectionPromise = null
  }
}

export async function invoke(method: string, ...args: unknown[]): Promise<unknown> {
  const conn = await ensureConnection()
  return conn.invoke(method, ...args)
}

export function on(event: string, handler: (...args: unknown[]) => void): void {
  if (connection) connection.on(event, handler)
}

export function off(event: string, handler: (...args: unknown[]) => void): void {
  if (connection) connection.off(event, handler)
}
