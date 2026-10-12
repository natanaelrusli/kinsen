import { once } from 'node:events'
import { createServer } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { BrowserBridge } from './bridge.js'
import { readBridgeConfig } from './config.js'
import type { BridgeConfig } from './config.js'

const token = 'test-only-pairing-secret-32-characters-long'
const origin = 'http://127.0.0.1:5173'
const bridges: BrowserBridge[] = []
const sockets: WebSocket[] = []

async function startBridge(): Promise<{ bridge: BrowserBridge; config: BridgeConfig }> {
  const reservation = createServer()
  const listening = once(reservation, 'listening')
  reservation.listen(0, '127.0.0.1')
  await listening
  const address = reservation.address()
  if (!address || typeof address === 'string') throw new Error('No port was allocated.')
  const closed = once(reservation, 'close')
  reservation.close()
  await closed
  const config = { port: address.port, origin, token }
  const bridge = new BrowserBridge(config)
  bridges.push(bridge)
  await bridge.start()
  return { bridge, config }
}

async function connectBrowser(config: BridgeConfig): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${config.port}`, { origin: config.origin })
  sockets.push(socket)
  await once(socket, 'open')
  return socket
}

async function pairBrowser(config: BridgeConfig): Promise<WebSocket> {
  const socket = await connectBrowser(config)
  const paired = once(socket, 'message')
  socket.send(JSON.stringify({ type: 'pair', token: config.token, protocolVersion: 1 }))
  const [message] = await paired
  expect(JSON.parse(message.toString())).toEqual({ type: 'paired', protocolVersion: 1 })
  return socket
}

afterEach(async () => {
  vi.useRealTimers()
  for (const socket of sockets.splice(0)) socket.terminate()
  await Promise.all(bridges.splice(0).map(bridge => bridge.close()))
})

describe('bridge configuration', () => {
  it('requires a secret and validates the port without echoing values', () => {
    expect(() => readBridgeConfig({})).toThrow()
    expect(() => readBridgeConfig({ KINSEN_BRIDGE_TOKEN: 'short' })).toThrow()
    for (const port of ['0', '65536', '1.5', '-1', '', 'secret-value']) {
      expect(() => readBridgeConfig({ KINSEN_BRIDGE_TOKEN: token, KINSEN_BRIDGE_PORT: port })).toThrow()
    }
  })

  it('accepts explicitly configured LAN origins but not paths or credentials', () => {
    expect(readBridgeConfig({ KINSEN_BRIDGE_TOKEN: token, KINSEN_APP_ORIGIN: 'http://192.168.1.12:3001' }).origin).toBe('http://192.168.1.12:3001')
    for (const value of ['http://127.0.0.1:5173/', 'http://127.0.0.1:5173/path', 'https://user:secret@example.com', 'file:///tmp/app', 'http://127.0.0.1:5173?x=1']) {
      expect(() => readBridgeConfig({ KINSEN_BRIDGE_TOKEN: token, KINSEN_APP_ORIGIN: value })).toThrow()
    }
  })
})

describe('browser bridge security and delivery', () => {
  it.each([
    { origin: undefined, host: undefined },
    { origin: 'http://localhost:5173', host: undefined },
    { origin: 'https://attacker.example', host: undefined },
    { origin, host: 'rebound.attacker.example:3003' },
  ])('rejects unauthorized upgrade headers: %j', async headers => {
    const { bridge, config } = await startBridge()
    const socket = new WebSocket(`ws://127.0.0.1:${config.port}`, {
      ...(headers.origin ? { origin: headers.origin } : {}),
      ...(headers.host ? { headers: { Host: headers.host } } : {}),
    })
    sockets.push(socket)
    const rejected = once(socket, 'error')
    const [error] = await rejected
    expect(error.message).toContain('403')
    await expect(bridge.call('kinsen_get_data', {})).rejects.toThrow('No browser is paired')
  })

  it.each([
    { type: 'pair', token: 'wrong-token-also-at-least-32-characters', protocolVersion: 1 },
    { type: 'pair', token, protocolVersion: 2 },
    { type: 'result', id: 'unpaired', ok: true, data: {} },
  ])('does not authenticate invalid pairing: %j', async message => {
    const { bridge, config } = await startBridge()
    const socket = await connectBrowser(config)
    const closed = once(socket, 'close')
    socket.send(JSON.stringify(message))
    await closed
    await expect(bridge.call('kinsen_get_data', {})).rejects.toThrow('No browser is paired')
  })

  it('drops an unpaired socket after the pairing deadline', async () => {
    const { bridge, config } = await startBridge()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const socket = await connectBrowser(config)
    const closed = once(socket, 'close')
    await vi.advanceTimersByTimeAsync(5001)
    await closed
    await expect(bridge.call('kinsen_get_data', {})).rejects.toThrow('No browser is paired')
  })

  it('rejects a second browser without disturbing the authenticated one', async () => {
    const { bridge, config } = await startBridge()
    const browser = await pairBrowser(config)
    const extra = new WebSocket(`ws://127.0.0.1:${config.port}`, { origin })
    sockets.push(extra)
    const closed = once(extra, 'close')
    await closed
    const received = once(browser, 'message')
    const call = bridge.call('kinsen_get_data', {})
    const [message] = await received
    const request = JSON.parse(message.toString())
    browser.send(JSON.stringify({ type: 'result', id: request.id, ok: true, data: { real: true } }))
    await expect(call).resolves.toEqual({ real: true })
  })

  it('matches replies by ID and propagates only the correlated browser error', async () => {
    const { bridge, config } = await startBridge()
    const browser = await pairBrowser(config)
    const firstReceived = once(browser, 'message')
    const first = bridge.call('kinsen_get_data', {})
    const firstFailure = expect(first).rejects.toThrow('Record cannot be deleted.')
    const [firstMessage] = await firstReceived
    const firstRequest = JSON.parse(firstMessage.toString())
    const secondReceived = once(browser, 'message')
    const second = bridge.call('kinsen_get_data', { scope: 'assets' })
    const [secondMessage] = await secondReceived
    const secondRequest = JSON.parse(secondMessage.toString())
    browser.send(JSON.stringify({ type: 'result', id: 'unrelated', ok: true, data: 'wrong' }))
    browser.send(JSON.stringify({ type: 'result', id: secondRequest.id, ok: true, data: ['asset'] }))
    browser.send(JSON.stringify({ type: 'result', id: firstRequest.id, ok: false, error: 'Record cannot be deleted.' }))
    await expect(second).resolves.toEqual(['asset'])
    await firstFailure
  })

  it('settles all pending requests on disconnect without replaying them after a new pairing', async () => {
    const { bridge, config } = await startBridge()
    const browser = await pairBrowser(config)
    const received = once(browser, 'message')
    const call = bridge.call('kinsen_delete_transaction', { id: 'expense', confirm: true })
    const failure = expect(call).rejects.toThrow(/disconnected.*outcome may be unknown.*do not retry blindly/)
    await received
    browser.terminate()
    await failure
    const replacement = await pairBrowser(config)
    const nextReceived = once(replacement, 'message')
    const next = bridge.call('kinsen_get_data', {})
    const [message] = await nextReceived
    const request = JSON.parse(message.toString())
    expect(request.name).toBe('kinsen_get_data')
    replacement.send(JSON.stringify({ type: 'result', id: request.id, ok: true, data: {} }))
    await next
  })

  it('expires a call with an explicit unknown-outcome warning and ignores late replies', async () => {
    const { bridge, config } = await startBridge()
    const browser = await pairBrowser(config)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const received = once(browser, 'message')
    const call = bridge.call('kinsen_delete_transaction', { id: 'expense', confirm: true })
    const failure = expect(call).rejects.toThrow(/deadline.*outcome may be unknown.*do not retry blindly/)
    const [message] = await received
    const request = JSON.parse(message.toString())
    await vi.advanceTimersByTimeAsync(30_001)
    await failure
    browser.send(JSON.stringify({ type: 'result', id: request.id, ok: true, data: 'late' }))
    vi.useRealTimers()
    const nextReceived = once(browser, 'message')
    const next = bridge.call('kinsen_get_data', {})
    const [nextMessage] = await nextReceived
    const nextRequest = JSON.parse(nextMessage.toString())
    browser.send(JSON.stringify({ type: 'result', id: nextRequest.id, ok: true, data: 'current' }))
    await expect(next).resolves.toBe('current')
  })

  it('rejects oversized frames and settles pending calls', async () => {
    const { bridge, config } = await startBridge()
    const browser = await pairBrowser(config)
    const received = once(browser, 'message')
    const call = bridge.call('kinsen_get_data', {})
    const failure = expect(call).rejects.toThrow('outcome may be unknown')
    await received
    const closed = once(browser, 'close')
    browser.send('x'.repeat(1024 * 1024 + 1))
    await failure
    await closed
  })

  it('settles pending calls and closes sockets on shutdown', async () => {
    const { bridge, config } = await startBridge()
    const browser = await pairBrowser(config)
    const received = once(browser, 'message')
    const call = bridge.call('kinsen_get_data', {})
    const failure = expect(call).rejects.toThrow('bridge shut down')
    await received
    const closed = once(browser, 'close')
    await bridge.close()
    await failure
    await closed
    await expect(bridge.call('kinsen_get_data', {})).rejects.toThrow('No browser is paired')
  })

})
