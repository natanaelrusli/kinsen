import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectMcpBridge, disconnectMcpBridge, useMcpBridgeStore } from './browser-bridge'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  accountCleared: null as (() => void) | null,
}))
vi.mock('../../application/mcp/execute-tool', () => ({ executeMcpTool: mocks.execute }))
vi.mock('../repositories/dexie-budget-repository', () => ({
  budgetRepository: {
    onAccountDataCleared: (listener: () => void) => { mocks.accountCleared = listener },
  },
}))

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null

  constructor(readonly url: string) { FakeWebSocket.instances.push(this) }
  send(message: string) { this.sent.push(message) }
  close() { this.readyState = 3 }
  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }) }
  pair() {
    this.open()
    this.receive({ type: 'paired', protocolVersion: 1 })
  }
}

const secret = 'a'.repeat(32)
const readCommand = (id: string) => ({ type: 'call', id, name: 'kinsen_get_data', arguments: {} })

async function flushQueue() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function connect() {
  connectMcpBridge(secret, '3003')
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!
}

describe('browser MCP bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    mocks.execute.mockReset()
    mocks.execute.mockResolvedValue({ scope: 'all' })
    disconnectMcpBridge()
  })
  afterEach(() => {
    disconnectMcpBridge()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })


  it('rejects a command before the server acknowledges pairing', async () => {
    const socket = connect()
    socket.open()
    socket.receive(readCommand('unpaired'))
    await flushQueue()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(socket.readyState).toBe(3)
    expect(useMcpBridgeStore.getState().status).toBe('failed')
  })

  it('rejects incompatible and malformed messages without executing commands', async () => {
    const first = connect()
    first.open()
    first.receive({ type: 'paired', protocolVersion: 2 })
    expect(useMcpBridgeStore.getState().status).toBe('failed')
    const second = connect()
    second.pair()
    second.onmessage?.({ data: 'not json' })
    await flushQueue()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(second.readyState).toBe(3)
  })

  it('times out pairing and never automatically reconnects', () => {
    const socket = connect()
    vi.advanceTimersByTime(10_000)
    expect(socket.readyState).toBe(3)
    expect(useMcpBridgeStore.getState().status).toBe('failed')
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('serializes commands and invalidates queued work on disconnect', async () => {
    let finish!: (value: unknown) => void
    mocks.execute.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const socket = connect()
    socket.pair()
    socket.receive(readCommand('running'))
    socket.receive(readCommand('queued'))
    await flushQueue()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    const signal = mocks.execute.mock.calls[0]![2] as AbortSignal
    disconnectMcpBridge()
    expect(signal.aborted).toBe(true)
    finish({ finished: true })
    await flushQueue()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(socket.sent).toHaveLength(1)
    expect(useMcpBridgeStore.getState().status).toBe('disconnected')
  })

  it('revokes active and queued commands when account data is cleared', async () => {
    const socket = connect()
    socket.pair()
    socket.receive(readCommand('queued-before-reset'))
    mocks.accountCleared!()
    await flushQueue()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(socket.readyState).toBe(3)
    expect(useMcpBridgeStore.getState().status).toBe('disconnected')
  })

  it('does not allow old queued work to execute after a new pairing', async () => {
    const oldSocket = connect()
    oldSocket.pair()
    oldSocket.receive(readCommand('old-command'))
    const newSocket = connect()
    newSocket.pair()
    newSocket.receive(readCommand('new-command'))
    await flushQueue()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(JSON.parse(newSocket.sent[1]!).id).toBe('new-command')
    expect(oldSocket.sent).toHaveLength(1)
  })

  it('validates arguments locally and never exposes raw exception text', async () => {
    const socket = connect()
    socket.pair()
    socket.receive({ type: 'call', id: 'invalid', name: 'kinsen_delete_transaction', arguments: { id: 'transaction' } })
    await flushQueue()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(JSON.parse(socket.sent[1]!)).toMatchObject({ id: 'invalid', ok: false })
    mocks.execute.mockRejectedValueOnce(new Error(`Credential ${secret}: ${'x'.repeat(1000)}`))
    socket.receive(readCommand('failed'))
    await flushQueue()
    const result = JSON.parse(socket.sent[2]!)
    expect(result.ok).toBe(false)
    expect(result.error.length).toBeLessThanOrEqual(500)
    expect(result.error).not.toContain(secret)
  })

  it('rejects repeated command IDs rather than repeating mutations', async () => {
    const socket = connect()
    socket.pair()
    socket.receive(readCommand('same-id'))
    await flushQueue()
    socket.receive(readCommand('same-id'))
    await flushQueue()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(socket.readyState).toBe(3)
    expect(useMcpBridgeStore.getState().status).toBe('failed')
  })

  it('reports unexpected closure and preserves unknown mutation outcome guidance', () => {
    const socket = connect()
    socket.pair()
    socket.readyState = 3
    socket.onclose?.()
    expect(useMcpBridgeStore.getState().status).toBe('closed')
    expect(useMcpBridgeStore.getState().error).toContain('do not retry blindly')
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
