import * as signalR from '@microsoft/signalr'

const HUB_URL = '/hubs/collaboration'
const TOKEN_KEY = 'versatile_api_token'

let connection = null
let connectionPromise = null

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getConnectionState() {
  if (!connection) return signalR.HubConnectionState.Disconnected
  return connection.state
}

export async function ensureConnection() {
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

  connectionPromise = connection.start()
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

export async function disconnect() {
  if (connection) {
    await connection.stop()
    connection = null
    connectionPromise = null
  }
}

export async function invoke(method, ...args) {
  const conn = await ensureConnection()
  return conn.invoke(method, ...args)
}

export function on(event, handler) {
  if (connection) connection.on(event, handler)
}

export function off(event, handler) {
  if (connection) connection.off(event, handler)
}
