export interface BridgeConfig {
  port: number
  origin: string
  token: string
}

export type TransportMode = 'stdio' | 'http'

export interface HttpConfig {
  host: string
  port: number
  token: string
  allowedHosts: string[]
  allowedOrigins: string[]
}

const loopbackHostNames = new Set(['127.0.0.1', '::1', 'localhost'])

export function loopbackHosts(port: number): string[] {
  return [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]
}

function parsePort(name: string, value: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer from 1 to 65535.`)
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535.`)
  }
  return port
}

function isExactOrigin(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol) && new URL(value).origin === value
  } catch {
    return false
  }
}

function readList(value: string | undefined): string[] {
  return (value ?? '').split(',').map(item => item.trim().toLowerCase()).filter(item => item.length > 0)
}

export function readTransportMode(env: NodeJS.ProcessEnv = process.env): TransportMode {
  const value = env.KINSEN_MCP_TRANSPORT ?? 'stdio'
  if (value !== 'stdio' && value !== 'http') throw new Error('KINSEN_MCP_TRANSPORT must be stdio or http.')
  return value
}

export function readBridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const port = parsePort('KINSEN_BRIDGE_PORT', env.KINSEN_BRIDGE_PORT ?? '3003')

  const origin = env.KINSEN_APP_ORIGIN ?? 'http://127.0.0.1:5173'
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    throw new Error('KINSEN_APP_ORIGIN must be an exact HTTP(S) origin without a path.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
    throw new Error('KINSEN_APP_ORIGIN must be an exact HTTP(S) origin without a path, credentials, query, or fragment.')
  }

  const token = env.KINSEN_BRIDGE_TOKEN
  if (!token || token.length < 32) {
    throw new Error('KINSEN_BRIDGE_TOKEN is required and must contain at least 32 characters. Configure the same secret in the signed-in app.')
  }
  return { port, origin, token }
}

export function readHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const port = parsePort('KINSEN_MCP_HTTP_PORT', env.KINSEN_MCP_HTTP_PORT ?? '3004')
  const host = (env.KINSEN_MCP_HTTP_HOST ?? '127.0.0.1').trim()

  // The MCP secret is a separate credential: a leaked browser pairing token must not grant agent access, and vice versa.
  const token = env.KINSEN_MCP_TOKEN
  if (!token || token.length < 32) {
    throw new Error('KINSEN_MCP_TOKEN is required and must contain at least 32 characters. Use a secret separate from KINSEN_BRIDGE_TOKEN.')
  }
  if (token === env.KINSEN_BRIDGE_TOKEN) throw new Error('KINSEN_MCP_TOKEN must differ from KINSEN_BRIDGE_TOKEN.')

  const loopback = loopbackHostNames.has(host.toLowerCase())
  if (!loopback && env.KINSEN_MCP_HTTP_ALLOW_NON_LOOPBACK !== 'true') {
    throw new Error('Binding KINSEN_MCP_HTTP_HOST to a non-loopback address requires KINSEN_MCP_HTTP_ALLOW_NON_LOOPBACK=true and HTTPS in front of the server.')
  }

  const explicitHosts = readList(env.KINSEN_MCP_HTTP_ALLOWED_HOSTS)
  const allowedHosts = explicitHosts.length > 0 ? explicitHosts : loopback ? loopbackHosts(port) : []
  if (allowedHosts.length === 0) {
    throw new Error('KINSEN_MCP_HTTP_ALLOWED_HOSTS is required when binding a non-loopback host; list the Host values clients use.')
  }

  const allowedOrigins = readList(env.KINSEN_MCP_HTTP_ALLOWED_ORIGINS)
  for (const origin of allowedOrigins) {
    if (!isExactOrigin(origin)) throw new Error('KINSEN_MCP_HTTP_ALLOWED_ORIGINS must contain exact HTTP(S) origins.')
  }
  return { host, port, token, allowedHosts, allowedOrigins }
}
