import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { useEffect, useState, type FormEvent } from 'react'
import { connectMcpBridge, disconnectMcpBridge, useMcpBridgeStore } from '../../infrastructure/mcp/browser-bridge'

export function AiAgentConnectionPanel() {
  const status = useMcpBridgeStore((state) => state.status)
  const error = useMcpBridgeStore((state) => state.error)
  const [token, setToken] = useState('')
  const [port, setPort] = useState('3003')
  const pending = status === 'connecting' || status === 'pairing'
  const connected = status === 'paired'

  useEffect(() => {
    if (status === 'paired') setToken('')
  }, [status])

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pending && !connected) connectMcpBridge(token, port)
  }

  return (
    <section className="account-setting-card" aria-labelledby="ai-agent-connection-title">
      <Stack gap={3} width="100%">
        <h2 id="ai-agent-connection-title">AI agent connection</h2>
        <p id="ai-agent-access-warning">Connecting grants the AI agent full read and write access to your financial data, including creating, changing and deleting budget records, assets, liabilities and PLN Token Tracker readings. Connect only an agent you trust. No account reset or deactivation tools are exposed.</p>
        <Stack direction="horizontal" wrap="wrap" gap={2} vAlign="center" role="status" aria-live="polite">
          <Token
            label={connected ? 'Connected' : status === 'connecting' ? 'Connecting' : status === 'pairing' ? 'Pairing' : status === 'failed' ? 'Connection failed' : status === 'closed' ? 'Connection closed' : 'Disconnected'}
            color={connected ? 'green' : pending ? 'blue' : status === 'failed' ? 'red' : 'default'}
          />
        </Stack>
        {error && <p className="form-error" role="alert">{error}</p>}
        {connected ? (
          <Button label="Disconnect AI agent" variant="secondary" onClick={disconnectMcpBridge} />
        ) : (
          <form onSubmit={connect} aria-describedby="ai-agent-access-warning ai-agent-connection-help">
            <Stack gap={3}>
              <TextInput
                label="Bridge secret"
                description="Use KINSEN_BRIDGE_TOKEN from your MCP server configuration (at least 32 characters), not your Clerk sign-in token. This secret is not saved."
                type="password"
                autoComplete="off"
                value={token}
                onChange={setToken}
                isDisabled={pending}
              />
              <TextInput label="Local bridge port" description="The MCP server’s local WebSocket port; the default is 3003." value={port} onChange={setPort} autoComplete="off" isDisabled={pending} />
              <Stack direction="horizontal" wrap="wrap" gap={2}>
                <Button label={pending ? 'Connecting…' : 'Connect AI agent'} variant="primary" type="submit" isLoading={pending} isDisabled={token.length < 32 || !port} />
                {pending && <Button label="Cancel connection" variant="secondary" onClick={disconnectMcpBridge} />}
              </Stack>
            </Stack>
          </form>
        )}
        <p id="ai-agent-connection-help">Keep this signed-in app open while the agent works. You can navigate to other pages without disconnecting. Disconnect, sign-out or clearing account data revokes access and queued commands; a command already in progress may still finish. Check current data before retrying a failed command. Kinsen never reconnects or replays commands automatically.</p>
        <p>Use the local HTTP development app to connect to ws://127.0.0.1:{port || '3003'}. An HTTPS page may block this insecure WebSocket. If pairing is rejected, set the server’s KINSEN_APP_ORIGIN to this app’s exact origin: {window.location.origin}. localhost and 127.0.0.1 do not match.</p>
      </Stack>
    </section>
  )
}
