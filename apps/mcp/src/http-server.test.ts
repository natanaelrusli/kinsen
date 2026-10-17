import { request } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { tools } from '@kinsen/mcp-contract'
import { afterEach, describe, expect, it } from 'vitest'
import { BrowserBridge } from './bridge.js'
import { loopbackHosts, readHttpConfig } from './config.js'
import type { HttpConfig } from './config.js'
import { createMcpHttpServer } from './http-server.js'
import type { McpHttpServer } from './http-server.js'

const mcpToken = 'mcp-only-secret-value-of-at-least-32-chars'
const bridgeToken = 'bridge-only-secret-value-of-at-least-32-chars'
const initializeBody = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test-client', version: '1.0.0' } },
})

interface Reply {
  status: number
  headers: IncomingHttpHeaders
  text: string
}

const servers: McpHttpServer[] = []
const bridges: BrowserBridge[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
  await Promise.all(bridges.splice(0).map(bridge => bridge.close()))
})

async function reservePort(): Promise<number> {
  const reservation = createServer()
  const listening = once(reservation, 'listening')
  reservation.listen(0, '127.0.0.1')
  await listening
  const address = reservation.address()
  if (!address || typeof address === 'string') throw new Error('No port was allocated.')
  const closed = once(reservation, 'close')
  reservation.close()
  await closed
  return address.port
}

async function startServer(overrides: Partial<HttpConfig> = {}, authFailures?: { maxFailures: number; windowMs: number }) {
  const bridgePort = await reservePort()
  const port = await reservePort()
  const bridge = new BrowserBridge({ port: bridgePort, origin: 'http://127.0.0.1:5173', token: bridgeToken })
  bridges.push(bridge)
  await bridge.start()
  const config: HttpConfig = {
    host: '127.0.0.1', port, token: mcpToken, allowedHosts: loopbackHosts(port), allowedOrigins: [], ...overrides,
  }
  const server = createMcpHttpServer({ bridge, config, authFailures })
  servers.push(server)
  const address = await server.listen()
  return { port, address, server }
}

function send(port: number, options: { method?: string; path?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      method: options.method ?? 'POST',
      path: options.path ?? '/mcp',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...options.headers,
      },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString() }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end(options.body)
  })
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

async function initialize(port: number): Promise<string> {
  const reply = await send(port, { headers: bearer(mcpToken), body: initializeBody })
  expect(reply.status).toBe(200)
  const sessionId = reply.headers['mcp-session-id']
  if (typeof sessionId !== 'string') throw new Error('Initialize did not return a session id.')
  return sessionId
}

describe('MCP HTTP authentication', () => {
  it('rejects a request without a token with 401 and a Bearer challenge', async () => {
    const { port } = await startServer()
    const reply = await send(port, { body: initializeBody })
    expect(reply.status).toBe(401)
    expect(reply.headers['www-authenticate']).toMatch(/^Bearer/)
    expect(reply.text).not.toContain(mcpToken)
  })

  it('rejects a wrong token, a short token and a non-Bearer scheme', async () => {
    const { port } = await startServer()
    const wrong = 'x'.repeat(mcpToken.length)
    for (const authorization of [`Bearer ${wrong}`, 'Bearer short', `Basic ${mcpToken}`]) {
      const reply = await send(port, { headers: { authorization }, body: initializeBody })
      expect(reply.status).toBe(401)
      expect(reply.text).not.toContain(mcpToken)
    }
  })

  it('rejects the browser bridge token as an MCP credential', async () => {
    const { port } = await startServer()
    const reply = await send(port, { headers: bearer(bridgeToken), body: initializeBody })
    expect(reply.status).toBe(401)
  })

  it('accepts the correct token and completes initialize, then lists tools', async () => {
    const { port } = await startServer()
    const sessionId = await initialize(port)

    const initialized = await send(port, {
      headers: { ...bearer(mcpToken), 'mcp-session-id': sessionId },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
    expect(initialized.status).toBe(202)

    const list = await send(port, {
      headers: { ...bearer(mcpToken), 'mcp-session-id': sessionId },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    })
    expect(list.status).toBe(200)
    const names = (JSON.parse(list.text) as { result: { tools: { name: string }[] } }).result.tools.map(tool => tool.name)
    expect(names.sort()).toEqual(Object.keys(tools).sort())
  })

  it('returns a clear tool error when no browser tab is paired', async () => {
    const { port } = await startServer()
    const sessionId = await initialize(port)
    const call = await send(port, {
      headers: { ...bearer(mcpToken), 'mcp-session-id': sessionId },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'kinsen_get_data', arguments: {} } }),
    })
    expect(call.status).toBe(200)
    const result = (JSON.parse(call.text) as { result: { isError: boolean; content: { text: string }[] } }).result
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('No browser is paired')
  })

  it('locks out an IP after repeated failed attempts, even with the correct token', async () => {
    const { port } = await startServer({}, { maxFailures: 3, windowMs: 60_000 })
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reply = await send(port, { headers: bearer('y'.repeat(40)), body: initializeBody })
      expect(reply.status).toBe(401)
    }
    const blocked = await send(port, { headers: bearer(mcpToken), body: initializeBody })
    expect(blocked.status).toBe(429)
    expect(blocked.headers['retry-after']).toBeDefined()
  })
})

describe('MCP HTTP network rules', () => {
  it('rejects a Host header outside the allowlist (DNS rebinding)', async () => {
    const { port } = await startServer()
    const reply = await send(port, { headers: { ...bearer(mcpToken), host: 'evil.example' }, body: initializeBody })
    expect(reply.status).toBe(403)
  })

  it('rejects a browser Origin that is not allowlisted', async () => {
    const { port } = await startServer()
    const reply = await send(port, { headers: { ...bearer(mcpToken), origin: 'https://evil.example' }, body: initializeBody })
    expect(reply.status).toBe(403)
  })

  it('binds 127.0.0.1 with the default configuration', async () => {
    const port = await reservePort()
    const config = readHttpConfig({ KINSEN_BRIDGE_TOKEN: bridgeToken, KINSEN_MCP_TOKEN: mcpToken, KINSEN_MCP_HTTP_PORT: String(port) })
    const bridgePort = await reservePort()
    const bridge = new BrowserBridge({ port: bridgePort, origin: 'http://127.0.0.1:5173', token: bridgeToken })
    bridges.push(bridge)
    await bridge.start()
    const server = createMcpHttpServer({ bridge, config })
    servers.push(server)
    const address = await server.listen()
    expect(address.address).toBe('127.0.0.1')
  })

  it('returns 404 for paths other than /mcp', async () => {
    const { port } = await startServer()
    const reply = await send(port, { path: '/other', headers: bearer(mcpToken), body: initializeBody })
    expect(reply.status).toBe(404)
  })

  it('rejects bodies over the size limit with 413', async () => {
    const { port } = await startServer()
    const body = 'a'.repeat(1024 * 1024 + 1)
    const reply = await send(port, { headers: bearer(mcpToken), body })
    expect(reply.status).toBe(413)
  })

  it('rejects malformed JSON with a JSON-RPC parse error', async () => {
    const { port } = await startServer()
    const reply = await send(port, { headers: bearer(mcpToken), body: '{not json' })
    expect(reply.status).toBe(400)
    expect(reply.text).toContain('-32700')
  })

  it('requires a session id after initialization and rejects unknown sessions', async () => {
    const { port } = await startServer()
    const noSession = await send(port, { headers: bearer(mcpToken), body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }) })
    expect(noSession.status).toBe(400)

    const unknown = await send(port, {
      headers: { ...bearer(mcpToken), 'mcp-session-id': '00000000-0000-4000-8000-000000000000' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list' }),
    })
    expect(unknown.status).toBe(404)
  })

  it('stops accepting connections after graceful close', async () => {
    const { port, server } = await startServer()
    await initialize(port)
    await server.close()
    await expect(send(port, { headers: bearer(mcpToken), body: initializeBody })).rejects.toThrow()
  })
})
