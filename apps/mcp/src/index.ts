import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { BrowserBridge } from './bridge.js'
import { readBridgeConfig } from './config.js'
import type { BridgeConfig } from './config.js'
import { createMcpServer } from './mcp-server.js'

async function main(): Promise<void> {
  let config: BridgeConfig
  try {
    config = readBridgeConfig()
  } catch (error) {
    // Config validation errors are fixed messages, never interpolated environment values.
    process.stderr.write(`${error instanceof Error ? error.message : 'Invalid MCP bridge configuration.'}\n`)
    process.exitCode = 1
    return
  }
  const bridge = new BrowserBridge(config)
  const server = createMcpServer(bridge)
  const transport = new StdioServerTransport()
  let shutdownPromise: Promise<void> | undefined
  const shutdown = (): Promise<void> => {
    if (!shutdownPromise) {
      shutdownPromise = Promise.all([bridge.close(), server.close()]).then(() => {
        process.stdin.pause()
      })
    }
    return shutdownPromise
  }
  const stop = () => {
    void shutdown().catch(() => {
      process.stderr.write('The MCP server could not shut down cleanly.\n')
      process.exitCode = 1
    })
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  process.stdin.once('end', stop)
  process.stdin.once('close', stop)
  server.server.onclose = stop
  try {
    await bridge.start()
    if (shutdownPromise) return
    process.stderr.write(`Kinsen MCP browser bridge: ws://127.0.0.1:${config.port}; allowed app origin: ${config.origin}\n`)
    process.stderr.write('Open that signed-in app and explicitly pair using your configured KINSEN_BRIDGE_TOKEN. localhost and 127.0.0.1 origins must match exactly.\n')
    await server.connect(transport)
  } catch {
    process.stderr.write('Unable to start the Kinsen MCP server. Check bridge port availability and MCP transport configuration.\n')
    process.exitCode = 1
    await shutdown()
  }
}

void main().catch(() => {
  process.stderr.write('The Kinsen MCP server stopped unexpectedly.\n')
  process.exitCode = 1
})
