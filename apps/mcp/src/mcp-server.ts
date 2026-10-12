import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { tools } from '@kinsen/mcp-contract'
import type { BrowserBridge } from './bridge.js'

export function createMcpServer(bridge: BrowserBridge): McpServer {
  const server = new McpServer({ name: 'kinsen', version: '1.0.0' })
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(name, {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: {
        ...('readOnly' in tool ? { readOnlyHint: tool.readOnly } : {}),
        ...('destructive' in tool ? { destructiveHint: tool.destructive } : {}),
      },
    }, async (args: unknown): Promise<CallToolResult> => {
      try {
        const data = await bridge.call(name, args)
        const structuredContent = data !== null && typeof data === 'object' && !Array.isArray(data)
          ? data as Record<string, unknown>
          : { data }
        return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The Kinsen browser tool failed.'
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    })
  }
  return server
}
