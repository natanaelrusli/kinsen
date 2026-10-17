import { Banner } from '@astryxdesign/core/Banner'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useState } from 'react'
import { mcpEndpointFromAddress } from './mcp-http-endpoint'

// A placeholder only: the real KINSEN_MCP_TOKEN is never shown, stored or prefilled here.
const tokenPlaceholder = 'PASTE_MCP_SECRET'
const defaultAddress = 'http://127.0.0.1:3004'

export function McpHttpConnectionGuide() {
  const [address, setAddress] = useState(defaultAddress)
  const endpoint = mcpEndpointFromAddress(address)

  return (
    <Stack gap={3} width="100%">
      <h3 id="mcp-http-title">Connect an agent over HTTP</h3>
      <Text as="p">Use this when the agent runs on another machine or network. The HTTP server is a separate process you start yourself. It does not replace the browser pairing above.</Text>
      <Stack gap={2}>
        <Text as="p">1. Start the MCP server in HTTP mode with KINSEN_MCP_TRANSPORT=http, KINSEN_MCP_TOKEN (at least 32 characters), and KINSEN_BRIDGE_TOKEN set to the bridge secret you pair with above.</Text>
        <Text as="p">2. Keep this signed-in app open and paired above while the agent works. Closing the tab or disconnecting stops the agent’s access to your data.</Text>
        <Text as="p">3. Configure your agent with the endpoint below and send KINSEN_MCP_TOKEN in the Authorization header.</Text>
      </Stack>
      <TextInput
        label="MCP server address"
        description="Only the server address, for example http://127.0.0.1:3004 or https://kinsen.example.ts.net. Kinsen adds /mcp for you."
        value={address}
        onChange={setAddress}
        autoComplete="off"
      />
      {!endpoint.ok && (
        <Banner status="error" title="Enter only the server address" description="Use http:// or https:// with a host and optional port, and no path, query or credentials." collapsible={false} />
      )}
      {endpoint.ok && endpoint.isRemotePlainHttp && (
        <Banner status="warning" title="Remote access must use HTTPS" description="Plain HTTP sends the bearer token unencrypted. Use HTTPS for any address other than 127.0.0.1 or localhost." collapsible={false} />
      )}
      {endpoint.ok && (
        <Stack gap={3} width="100%">
          <CodeBlock title="Claude Code" language="bash" isWrapped code={`claude mcp add --transport http kinsen ${endpoint.endpoint} --header "Authorization: Bearer ${tokenPlaceholder}"`} />
          <CodeBlock
            title="Cursor: ~/.cursor/mcp.json"
            language="json"
            code={JSON.stringify({ mcpServers: { kinsen: { url: endpoint.endpoint, headers: { Authorization: `Bearer ${tokenPlaceholder}` } } } }, null, 2)}
          />
          <CodeBlock
            title="Codex: ~/.codex/config.toml"
            language="toml"
            code={`[mcp_servers.kinsen]\nurl = "${endpoint.endpoint}"\nbearer_token_env_var = "KINSEN_MCP_TOKEN"`}
          />
          <Text as="p">Codex reads the token from the KINSEN_MCP_TOKEN environment variable in the shell that starts it, so the secret stays out of the file.</Text>
        </Stack>
      )}
      <Text as="p">Remote access must go over HTTPS. Use Tailscale (tailnet-only, for example with tailscale serve), or a Cloudflare Tunnel or an HTTPS reverse proxy in front of the server. Never expose plain HTTP on the internet.</Text>
      <Text as="p">KINSEN_MCP_TOKEN is different from the bridge secret above. Kinsen never shows, stores or fills in your real token. Paste it into your agent’s configuration yourself.</Text>
    </Stack>
  )
}
