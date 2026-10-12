import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disconnectMcpBridge } from '../../infrastructure/mcp/browser-bridge'
import { AiAgentConnectionPanel } from './AiAgentConnectionPanel'

vi.mock('../../application/mcp/execute-tool', () => ({ executeMcpTool: vi.fn() }))
vi.mock('../../infrastructure/repositories/dexie-budget-repository', () => ({
  budgetRepository: { onAccountDataCleared: vi.fn() },
}))

class PanelWebSocket {
  static OPEN = 1
  static instances: PanelWebSocket[] = []
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor() { PanelWebSocket.instances.push(this) }
  send(message: string) { this.sent.push(message) }
  close() { this.readyState = 3 }
  pair() {
    this.readyState = PanelWebSocket.OPEN
    this.onopen?.()
    this.onmessage?.({ data: JSON.stringify({ type: 'paired', protocolVersion: 1 }) })
  }
}

const secret = 'bridge-secret-for-explicit-consent-only'

describe('AI agent connection panel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', PanelWebSocket)
    PanelWebSocket.instances = []
    disconnectMcpBridge()
  })
  afterEach(() => {
    cleanup()
    disconnectMcpBridge()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('requires explicit consent and presents access and origin warnings', () => {
    render(<AiAgentConnectionPanel />)
    expect(PanelWebSocket.instances).toHaveLength(0)
    expect(screen.getByLabelText('Bridge secret')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Connect AI agent' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Bridge secret'), { target: { value: secret } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect AI agent' }))
    expect(PanelWebSocket.instances).toHaveLength(1)
  })

  it('clears the secret on pairing, preserves pairing through navigation and disconnects explicitly', () => {
    const view = render(<AiAgentConnectionPanel />)
    fireEvent.change(screen.getByLabelText('Bridge secret'), { target: { value: secret } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect AI agent' }))
    const socket = PanelWebSocket.instances[0]!
    act(() => socket.pair())
    view.unmount()
    expect(socket.readyState).toBe(PanelWebSocket.OPEN)
    render(<AiAgentConnectionPanel />)
    expect(screen.getByRole('button', { name: 'Disconnect AI agent' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect AI agent' }))
    expect(socket.readyState).toBe(3)
    expect(screen.getByLabelText('Bridge secret')).toHaveValue('')
  })

  it('does not retain the paired secret when disconnecting without leaving the page', () => {
    render(<AiAgentConnectionPanel />)
    fireEvent.change(screen.getByLabelText('Bridge secret'), { target: { value: secret } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect AI agent' }))
    act(() => PanelWebSocket.instances[0]!.pair())
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect AI agent' }))
    expect(screen.getByLabelText('Bridge secret')).toHaveValue('')
    expect(PanelWebSocket.instances).toHaveLength(1)
  })
})
