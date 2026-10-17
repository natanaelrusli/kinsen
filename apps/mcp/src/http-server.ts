import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { BrowserBridge } from './bridge.js'
import type { HttpConfig } from './config.js'
import { createMcpServer } from './mcp-server.js'

const mcpPath = '/mcp'
const maxBodyBytes = 1024 * 1024
const requestTimeoutMs = 30_000
const headersTimeoutMs = 10_000
const keepAliveTimeoutMs = 5_000
const shutdownGraceMs = 5_000
const maxSessions = 100
const maxTrackedAddresses = 10_000
const challenge = 'Bearer realm="kinsen-mcp"'

export interface AuthFailureLimit {
  maxFailures: number
  windowMs: number
}

export interface McpHttpServerOptions {
  bridge: BrowserBridge
  config: HttpConfig
  authFailures?: AuthFailureLimit
}

export interface McpHttpServer {
  listen(): Promise<AddressInfo>
  close(): Promise<void>
}

interface Session {
  transport: StreamableHTTPServerTransport
  server: McpServer
}

// Counts failed credential attempts per client address. The lockout never records the token or the address in a response.
class AuthFailureTracker {
  private readonly entries = new Map<string, { count: number; resetAt: number }>()

  constructor(private readonly limit: AuthFailureLimit) {}

  retryAfterSeconds(address: string): number {
    const entry = this.entries.get(address)
    if (!entry) return 0
    const remainingMs = entry.resetAt - Date.now()
    if (remainingMs <= 0) {
      this.entries.delete(address)
      return 0
    }
    return entry.count >= this.limit.maxFailures ? Math.ceil(remainingMs / 1000) : 0
  }

  recordFailure(address: string): void {
    const now = Date.now()
    if (this.entries.size >= maxTrackedAddresses) this.sweep(now)
    const entry = this.entries.get(address)
    if (!entry || entry.resetAt <= now) {
      this.entries.set(address, { count: 1, resetAt: now + this.limit.windowMs })
    } else {
      entry.count += 1
    }
  }

  private sweep(now: number): void {
    for (const [address, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(address)
    }
  }
}

function sendJsonRpcError(res: ServerResponse, status: number, code: number, message: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }))
}

// Returns undefined when the body exceeds the limit. The excess is drained, not buffered, so the 413 response reaches the client.
function readBody(request: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBodyBytes) tooLarge = true
      else chunks.push(chunk)
    })
    request.on('end', () => resolve(tooLarge ? undefined : Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

// Compares fixed-length digests so the comparison time does not depend on the token's content or length.
function bearerTokenMatches(header: string, expectedDigest: Buffer): boolean {
  const token = /^Bearer +(\S+)$/i.exec(header)?.[1]
  return token !== undefined && timingSafeEqual(digest(token), expectedDigest)
}

// DNS rebinding and cross-site requests are rejected here, before any credential or body is read.
function hostAndOriginAllowed(request: IncomingMessage, config: HttpConfig): boolean {
  const host = request.headers.host?.toLowerCase()
  if (!host || !config.allowedHosts.includes(host)) return false
  const origin = request.headers.origin
  return origin === undefined || config.allowedOrigins.includes(origin.toLowerCase())
}

export function createMcpHttpServer({ bridge, config, authFailures = { maxFailures: 5, windowMs: 60_000 } }: McpHttpServerOptions): McpHttpServer {
  const tokenDigest = digest(config.token)
  const failures = new AuthFailureTracker(authFailures)
  const sessions = new Map<string, Session>()
  let closing: Promise<void> | undefined

  const http: Server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) sendJsonRpcError(response, 500, -32603, 'Internal server error.')
      else response.destroy()
    })
  })
  http.requestTimeout = requestTimeoutMs
  http.headersTimeout = headersTimeoutMs
  http.keepAliveTimeout = keepAliveTimeoutMs

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!hostAndOriginAllowed(request, config)) return sendJsonRpcError(response, 403, -32000, 'Forbidden.')
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (path !== mcpPath) return sendJsonRpcError(response, 404, -32000, 'Not found.')

    const address = request.socket.remoteAddress ?? 'unknown'
    const lockedFor = failures.retryAfterSeconds(address)
    if (lockedFor > 0) return sendJsonRpcError(response, 429, -32000, 'Too many failed authentication attempts.', { 'retry-after': String(lockedFor) })

    const authorization = request.headers.authorization
    if (authorization === undefined || !bearerTokenMatches(authorization, tokenDigest)) {
      if (authorization !== undefined) failures.recordFailure(address)
      return sendJsonRpcError(response, 401, -32001, 'Unauthorized.', { 'www-authenticate': challenge })
    }

    let body: unknown
    if (request.method === 'POST') {
      const text = await readBody(request)
      if (text === undefined) return sendJsonRpcError(response, 413, -32600, 'Request body exceeds the size limit.')
      try {
        body = JSON.parse(text)
      } catch {
        return sendJsonRpcError(response, 400, -32700, 'Parse error: Invalid JSON.')
      }
    }

    const sessionId = request.headers['mcp-session-id']
    if (sessionId !== undefined) {
      const session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined
      if (!session) return sendJsonRpcError(response, 404, -32001, 'Session not found.')
      return session.transport.handleRequest(request, response, body)
    }
    if (request.method === 'POST' && isInitializeRequest(body)) return startSession(request, response, body)
    return sendJsonRpcError(response, 400, -32000, 'Bad Request: Mcp-Session-Id header is required.')
  }

  async function startSession(request: IncomingMessage, response: ServerResponse, body: unknown): Promise<void> {
    if (sessions.size >= maxSessions) return sendJsonRpcError(response, 503, -32000, 'Too many MCP sessions are open.')
    const server = createMcpServer(bridge)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: id => {
        sessions.set(id, { transport, server })
        // Covers transport-level closes, so a dead session cannot keep occupying a slot.
        server.server.onclose = () => sessions.delete(id)
      },
      onsessionclosed: id => {
        const session = sessions.get(id)
        sessions.delete(id)
        void session?.server.close()
      },
    })
    await server.connect(transport)
    await transport.handleRequest(request, response, body)
    // A rejected initialize never creates a session; release the unused server instead of leaking it.
    if (!transport.sessionId) await server.close()
  }

  return {
    listen() {
      const { promise, resolve, reject } = Promise.withResolvers<AddressInfo>()
      http.once('error', reject)
      http.listen(config.port, config.host, () => {
        http.off('error', reject)
        const address = http.address()
        if (!address || typeof address === 'string') reject(new Error('No address was assigned.'))
        else resolve(address)
      })
      return promise
    },
    close() {
      closing ??= (async () => {
        // Stop accepting connections first, then end sessions; stragglers are cut after a grace period.
        const httpClosed = Promise.withResolvers<void>()
        http.close(() => httpClosed.resolve())
        http.closeIdleConnections()
        const grace = setTimeout(() => http.closeAllConnections(), shutdownGraceMs)
        const active = [...sessions.values()]
        sessions.clear()
        await Promise.all(active.map(session => session.server.close()))
        await httpClosed.promise
        clearTimeout(grace)
      })()
      return closing
    },
  }
}
