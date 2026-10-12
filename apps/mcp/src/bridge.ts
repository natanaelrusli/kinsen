import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import { bridgeProtocolVersion, bridgeResultSchema, parseToolCall } from '@kinsen/mcp-contract'
import type { BridgeConfig } from './config.js'

const maxMessageBytes = 1024 * 1024
const pairSchema = z.strictObject({
  type: z.literal('pair'), token: z.string().min(32), protocolVersion: z.literal(bridgeProtocolVersion),
})
const unknownOutcome = 'The mutation outcome may be unknown; read current data before proceeding and do not retry blindly.'

interface PendingCall {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export class BrowserBridge {
  private readonly http = createServer((_request, response) => {
    response.writeHead(404).end()
  })
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: maxMessageBytes, perMessageDeflate: false })
  private readonly tokenDigest: Buffer
  private readonly pending = new Map<string, PendingCall>()
  private readonly pairingTimers = new Map<WebSocket, NodeJS.Timeout>()
  private paired: WebSocket | undefined
  private stopped = false
  private shutdown: Promise<void> | undefined

  constructor(
    private readonly config: BridgeConfig,
    private readonly deadlines = { callMs: 30_000, pairMs: 5_000 },
  ) {
    this.tokenDigest = createHash('sha256').update(config.token).digest()
    this.http.on('upgrade', (request, socket, head) => {
      // Checking Host as well as Origin prevents a rebinding hostname reaching the loopback listener.
      socket.on('error', () => socket.destroy())
      if (this.stopped || request.headers.host !== `127.0.0.1:${config.port}` || request.headers.origin !== config.origin || request.url !== '/') {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        return
      }
      this.sockets.handleUpgrade(request, socket, head, connection => this.accept(connection))
    })
  }

  async start(): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>()
    this.http.once('error', reject)
    this.http.listen(this.config.port, '127.0.0.1', () => {
      this.http.off('error', reject)
      resolve()
    })
    await promise
  }

  async call(name: string, args: unknown): Promise<unknown> {
    const call = parseToolCall(name, args)
    const socket = this.paired
    if (this.stopped || !socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('No browser is paired. Open the signed-in Kinsen app and explicitly connect its MCP bridge.')
    }
    const id = randomUUID()
    const message = JSON.stringify({ type: 'call', id, name: call.name, arguments: call.arguments })
    if (Buffer.byteLength(message) > maxMessageBytes) throw new Error('The tool request exceeds the bridge message size limit.')
    const { promise, resolve, reject } = Promise.withResolvers<unknown>()
    const timer = setTimeout(() => {
      this.pending.delete(id)
      reject(new Error(`The browser did not respond within the bridge deadline. ${unknownOutcome}`))
    }, this.deadlines.callMs)
    this.pending.set(id, { resolve, reject, timer })
    socket.send(message, error => {
      if (error) this.disconnect(socket, `The browser request could not be delivered. ${unknownOutcome}`)
    })
    return promise
  }

  close(): Promise<void> {
    if (this.shutdown) return this.shutdown
    this.stopped = true
    this.rejectPending(`The MCP bridge shut down. ${unknownOutcome}`)
    this.paired = undefined
    for (const timer of this.pairingTimers.values()) clearTimeout(timer)
    this.pairingTimers.clear()
    for (const socket of this.sockets.clients) socket.terminate()
    const socketsClosed = Promise.withResolvers<void>()
    const httpClosed = Promise.withResolvers<void>()
    this.sockets.close(() => socketsClosed.resolve())
    this.http.close(() => httpClosed.resolve())
    this.shutdown = Promise.all([socketsClosed.promise, httpClosed.promise]).then(() => undefined)
    this.http.closeAllConnections()
    return this.shutdown
  }

  private accept(socket: WebSocket): void {
    socket.on('error', () => this.disconnect(socket, `The browser connection failed. ${unknownOutcome}`))
    socket.on('close', () => this.disconnect(socket, `The browser disconnected. ${unknownOutcome}`))
    if (this.stopped || this.paired) {
      socket.terminate()
      return
    }
    const timer = setTimeout(() => {
      this.pairingTimers.delete(socket)
      socket.terminate()
    }, this.deadlines.pairMs)
    this.pairingTimers.set(socket, timer)
    socket.on('message', (bytes, isBinary) => {
      if (socket.readyState !== WebSocket.OPEN) return
      if (isBinary) {
        this.disconnect(socket, `The browser sent an invalid bridge message. ${unknownOutcome}`)
        return
      }
      let value: unknown
      try {
        value = JSON.parse(bytes.toString())
      } catch {
        this.disconnect(socket, `The browser sent an invalid bridge message. ${unknownOutcome}`)
        return
      }
      if (socket !== this.paired) {
        const pair = pairSchema.safeParse(value)
        if (!pair.success || this.stopped || this.paired || !timingSafeEqual(
          createHash('sha256').update(pair.data.token).digest(), this.tokenDigest,
        )) {
          this.disconnect(socket, 'Browser pairing was denied.')
          return
        }
        clearTimeout(this.pairingTimers.get(socket))
        this.pairingTimers.delete(socket)
        this.paired = socket
        socket.send(JSON.stringify({ type: 'paired', protocolVersion: bridgeProtocolVersion }), error => {
          if (error) this.disconnect(socket, `Browser pairing failed. ${unknownOutcome}`)
        })
        return
      }
      const result = bridgeResultSchema.safeParse(value)
      if (!result.success) {
        this.disconnect(socket, `The browser sent an invalid bridge result. ${unknownOutcome}`)
        return
      }
      const pending = this.pending.get(result.data.id)
      // Late replies after deadlines, or unrelated IDs, must never settle another call.
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(result.data.id)
      if (result.data.ok) pending.resolve(result.data.data)
      else pending.reject(new Error(result.data.error.replaceAll(this.config.token, '[redacted]')))
    })
  }

  private disconnect(socket: WebSocket, message: string): void {
    clearTimeout(this.pairingTimers.get(socket))
    this.pairingTimers.delete(socket)
    if (this.paired === socket) {
      this.paired = undefined
      this.rejectPending(message)
    }
    socket.terminate()
  }

  private rejectPending(message: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(message))
    }
    this.pending.clear()
  }
}
