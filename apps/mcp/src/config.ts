export interface BridgeConfig {
  port: number
  origin: string
  token: string
}

export function readBridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const portValue = env.KINSEN_BRIDGE_PORT ?? '3003'
  if (!/^\d+$/.test(portValue)) throw new Error('KINSEN_BRIDGE_PORT must be an integer from 1 to 65535.')
  const port = Number(portValue)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('KINSEN_BRIDGE_PORT must be an integer from 1 to 65535.')
  }

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
