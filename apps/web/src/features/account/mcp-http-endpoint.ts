export type McpEndpointResult = { ok: true; endpoint: string; isRemotePlainHttp: boolean } | { ok: false }

const loopbackHostnames = new Set(['localhost', '127.0.0.1', '[::1]'])

// Accepts only a bare server address; the /mcp path is appended here so snippets never double it.
export function mcpEndpointFromAddress(value: string): McpEndpointResult {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return { ok: false }
  }
  if (!['http:', 'https:'].includes(url.protocol)) return { ok: false }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return { ok: false }
  return {
    ok: true,
    endpoint: `${url.origin}/mcp`,
    isRemotePlainHttp: url.protocol === 'http:' && !loopbackHostnames.has(url.hostname),
  }
}
