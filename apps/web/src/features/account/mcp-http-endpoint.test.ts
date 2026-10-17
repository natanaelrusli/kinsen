import { describe, expect, it } from 'vitest'
import { mcpEndpointFromAddress } from './mcp-http-endpoint'

describe('mcpEndpointFromAddress', () => {
  it('appends /mcp to a local server address', () => {
    expect(mcpEndpointFromAddress('http://127.0.0.1:3004')).toEqual({ ok: true, endpoint: 'http://127.0.0.1:3004/mcp', isRemotePlainHttp: false })
  })

  it('normalizes a trailing slash and reports HTTPS remote addresses as safe', () => {
    expect(mcpEndpointFromAddress(' https://kinsen.example.ts.net/ ')).toEqual({ ok: true, endpoint: 'https://kinsen.example.ts.net/mcp', isRemotePlainHttp: false })
  })

  it('flags plain HTTP to a non-loopback host', () => {
    expect(mcpEndpointFromAddress('http://100.64.0.5:3004')).toMatchObject({ ok: true, isRemotePlainHttp: true })
    expect(mcpEndpointFromAddress('http://localhost:3004')).toMatchObject({ isRemotePlainHttp: false })
  })

  it('rejects anything that is not a bare http(s) server address', () => {
    for (const value of ['', 'not a url', 'ftp://host', 'https://user:pass@host', 'https://host/mcp', 'https://host?x=1', 'https://host/#frag']) {
      expect(mcpEndpointFromAddress(value)).toEqual({ ok: false })
    }
  })
})
