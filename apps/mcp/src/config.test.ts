import { describe, expect, it } from 'vitest'
import { loopbackHosts, readHttpConfig, readTransportMode } from './config.js'

const mcpToken = 'mcp-only-secret-value-of-at-least-32-chars'
const bridgeToken = 'bridge-only-secret-value-of-at-least-32-chars'
const base = { KINSEN_BRIDGE_TOKEN: bridgeToken, KINSEN_MCP_TOKEN: mcpToken }

describe('readTransportMode', () => {
  it('defaults to stdio', () => {
    expect(readTransportMode({})).toBe('stdio')
  })

  it('accepts http and rejects unknown values', () => {
    expect(readTransportMode({ KINSEN_MCP_TRANSPORT: 'http' })).toBe('http')
    expect(() => readTransportMode({ KINSEN_MCP_TRANSPORT: 'HTTP' })).toThrow('KINSEN_MCP_TRANSPORT')
  })
})

describe('readHttpConfig', () => {
  it('binds loopback with loopback Host allowlist by default', () => {
    const config = readHttpConfig(base)
    expect(config).toMatchObject({ host: '127.0.0.1', port: 3004, allowedOrigins: [] })
    expect(config.allowedHosts).toEqual(loopbackHosts(3004))
    expect(config.allowedHosts).toContain('127.0.0.1:3004')
  })

  it('requires a token separate from the browser bridge token', () => {
    expect(() => readHttpConfig({ KINSEN_BRIDGE_TOKEN: bridgeToken })).toThrow('KINSEN_MCP_TOKEN')
    expect(() => readHttpConfig({ ...base, KINSEN_MCP_TOKEN: bridgeToken })).toThrow('must differ')
  })

  it('rejects short tokens without echoing them', () => {
    const shortToken = 'too-short-token'
    let message = ''
    try {
      readHttpConfig({ ...base, KINSEN_MCP_TOKEN: shortToken })
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }
    expect(message).toContain('at least 32')
    expect(message).not.toContain(shortToken)
  })

  it('refuses non-loopback binding without explicit opt-in', () => {
    expect(() => readHttpConfig({ ...base, KINSEN_MCP_HTTP_HOST: '0.0.0.0' })).toThrow('KINSEN_MCP_HTTP_ALLOW_NON_LOOPBACK')
    expect(() => readHttpConfig({ ...base, KINSEN_MCP_HTTP_HOST: '100.64.0.1', KINSEN_MCP_HTTP_ALLOW_NON_LOOPBACK: '1' })).toThrow('KINSEN_MCP_HTTP_ALLOW_NON_LOOPBACK')
  })

  it('requires an explicit Host allowlist when binding non-loopback', () => {
    expect(() => readHttpConfig({
      ...base, KINSEN_MCP_HTTP_HOST: '0.0.0.0', KINSEN_MCP_HTTP_ALLOW_NON_LOOPBACK: 'true',
    })).toThrow('KINSEN_MCP_HTTP_ALLOWED_HOSTS')
  })

  it('accepts a non-loopback bind with opt-in and an explicit Host allowlist', () => {
    const config = readHttpConfig({
      ...base,
      KINSEN_MCP_HTTP_HOST: '0.0.0.0',
      KINSEN_MCP_HTTP_ALLOW_NON_LOOPBACK: 'true',
      KINSEN_MCP_HTTP_ALLOWED_HOSTS: 'mac.tailnet-name.ts.net',
    })
    expect(config.host).toBe('0.0.0.0')
    expect(config.allowedHosts).toEqual(['mac.tailnet-name.ts.net'])
  })

  it('rejects invalid ports', () => {
    expect(() => readHttpConfig({ ...base, KINSEN_MCP_HTTP_PORT: '70000' })).toThrow('KINSEN_MCP_HTTP_PORT')
  })
})
