import { create } from 'zustand'
import { bridgeProtocolVersion, bridgeRequestSchema, parseToolCall, type BridgeResult, type ToolCall } from '@kinsen/mcp-contract'
import { executeMcpTool } from '../../application/mcp/execute-tool'
import { budgetRepository } from '../repositories/dexie-budget-repository'

type BridgeStatus = 'disconnected' | 'connecting' | 'pairing' | 'paired' | 'closed' | 'failed'

interface BridgeState {
  status: BridgeStatus
  error: string | null
}

interface Session {
  socket: WebSocket
  paired: boolean
  deadline: number | undefined
  controller: AbortController
  queue: Promise<void>
  requestIds: Set<string>
}

export const useMcpBridgeStore = create<BridgeState>(() => ({ status: 'disconnected', error: null }))
let activeSession: Session | null = null

function stopSession(status: BridgeStatus, error: string | null = null, closeCode = 1000) {
  const session = activeSession
  activeSession = null
  if (session) {
    window.clearTimeout(session.deadline)
    session.controller.abort()
    session.paired = false
    session.socket.onopen = null
    session.socket.onmessage = null
    session.socket.onerror = null
    session.socket.onclose = null
    session.socket.close(closeCode)
  }
  useMcpBridgeStore.setState({ status, error })
}

export function disconnectMcpBridge() {
  stopSession('disconnected')
}

function canDispatch(session: Session) {
  return activeSession === session && session.paired && session.socket.readyState === WebSocket.OPEN
}

function sendResult(session: Session, result: BridgeResult) {
  if (!canDispatch(session)) return
  try {
    session.socket.send(JSON.stringify(result))
  } catch {
    if (activeSession === session) stopSession('failed', 'The connection failed while sending a result. A mutation may already have completed; do not retry blindly.')
  }
}

export function connectMcpBridge(token: string, port: string) {
  disconnectMcpBridge()
  if (token.length < 32) {
    useMcpBridgeStore.setState({ status: 'failed', error: 'Use the bridge secret from KINSEN_BRIDGE_TOKEN, with at least 32 characters. This is not a Clerk token.' })
    return
  }
  if (!/^\d+$/.test(port) || !Number.isSafeInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
    useMcpBridgeStore.setState({ status: 'failed', error: 'Enter a port from 1 to 65535.' })
    return
  }

  let socket: WebSocket
  try {
    socket = new WebSocket(`ws://127.0.0.1:${Number(port)}`)
  } catch {
    useMcpBridgeStore.setState({ status: 'failed', error: 'The browser could not open the local connection. Use the local HTTP app; HTTPS may block insecure WebSockets.' })
    return
  }
  const session: Session = { socket, paired: false, deadline: undefined, controller: new AbortController(), queue: Promise.resolve(), requestIds: new Set() }
  activeSession = session
  useMcpBridgeStore.setState({ status: 'connecting', error: null })
  session.deadline = window.setTimeout(() => {
    if (activeSession === session) stopSession('failed', 'Pairing timed out. Check that the MCP server is running, the port and bridge secret match, and KINSEN_APP_ORIGIN matches this app’s origin.')
  }, 10_000)

  socket.onopen = () => {
    if (activeSession !== session) return
    useMcpBridgeStore.setState({ status: 'pairing', error: null })
    try {
      socket.send(JSON.stringify({ type: 'pair', token, protocolVersion: bridgeProtocolVersion }))
      token = ''
      socket.onopen = null
    } catch {
      stopSession('failed', 'The pairing request could not be sent. Check the local MCP server and connect again.')
    }
  }
  socket.onerror = () => {
    if (activeSession === session) stopSession('failed', 'The local connection failed. Check the MCP server, bridge secret, port and KINSEN_APP_ORIGIN. HTTPS may block insecure WebSockets.')
  }
  socket.onclose = () => {
    if (activeSession !== session) return
    const wasPaired = session.paired
    stopSession('closed', wasPaired
      ? 'The AI agent connection closed. A running mutation may already have completed; do not retry blindly. Connect again only when you are ready.'
      : 'Pairing was rejected or the server closed. Check the bridge secret and ensure KINSEN_APP_ORIGIN exactly matches this app’s origin; localhost and 127.0.0.1 are different origins.')
  }
  socket.onmessage = (event) => {
    if (activeSession !== session) return
    let message: unknown
    try {
      if (typeof event.data !== 'string') throw new Error('Not JSON text')
      message = JSON.parse(event.data)
    } catch {
      stopSession('failed', 'The server sent an invalid bridge message. The connection was revoked.', 1002)
      return
    }
    if (!session.paired) {
      if (useMcpBridgeStore.getState().status !== 'pairing' || !message || typeof message !== 'object'
        || Object.keys(message).length !== 2 || !('type' in message) || message.type !== 'paired'
        || !('protocolVersion' in message) || message.protocolVersion !== bridgeProtocolVersion) {
        stopSession('failed', 'The server did not complete the expected pairing protocol. No commands were accepted.', 1002)
        return
      }
      window.clearTimeout(session.deadline)
      session.deadline = undefined
      session.paired = true
      useMcpBridgeStore.setState({ status: 'paired', error: null })
      return
    }
    if (!canDispatch(session)) return

    const request = bridgeRequestSchema.safeParse(message)
    if (!request.success || session.requestIds.has(request.data.id)) {
      stopSession('failed', 'The server sent an invalid or repeated command. The connection was revoked.', 1002)
      return
    }
    session.requestIds.add(request.data.id)
    const { id, name, arguments: args } = request.data
    session.queue = session.queue.then(async () => {
      // A disconnected or replaced session must never start its queued commands.
      if (!canDispatch(session)) return
      let call: ToolCall
      try {
        call = parseToolCall(name, args)
      } catch {
        sendResult(session, { type: 'result', id, ok: false, error: 'Unknown tool or invalid arguments. No command was executed.' })
        return
      }
      try {
        const data = await executeMcpTool(call.name, call.arguments, session.controller.signal)
        sendResult(session, { type: 'result', id, ok: true, data })
      } catch {
        // Do not expose raw exception text: it can contain credentials or financial payloads.
        sendResult(session, { type: 'result', id, ok: false, error: 'Kinsen could not complete this command. Review the current data before retrying; a mutation may already have completed.' })
      }
    })
  }
}

budgetRepository.onAccountDataCleared(disconnectMcpBridge)
