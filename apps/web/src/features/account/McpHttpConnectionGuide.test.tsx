import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { McpHttpConnectionGuide } from './McpHttpConnectionGuide'

afterEach(cleanup)

describe('McpHttpConnectionGuide', () => {
  it('shows the default local endpoint in every client snippet, with a token placeholder only', () => {
    const { container } = render(<McpHttpConnectionGuide />)
    expect(screen.getByLabelText('MCP server address')).toHaveValue('http://127.0.0.1:3004')
    const text = container.textContent ?? ''
    expect(text).toContain('claude mcp add --transport http kinsen http://127.0.0.1:3004/mcp --header "Authorization: Bearer PASTE_MCP_SECRET"')
    expect(text).toContain('"url": "http://127.0.0.1:3004/mcp"')
    expect(text).toContain('url = "http://127.0.0.1:3004/mcp"')
    for (const input of screen.getAllByRole('textbox')) {
      expect((input as HTMLInputElement).value).not.toMatch(/[0-9a-f]{32,}/i)
    }
  })

  it('updates every snippet when the server address changes and makes no HTTPS warning for an HTTPS address', () => {
    const { container } = render(<McpHttpConnectionGuide />)
    fireEvent.change(screen.getByLabelText('MCP server address'), { target: { value: 'https://kinsen.example.ts.net/' } })
    const text = container.textContent ?? ''
    expect(text).toContain('claude mcp add --transport http kinsen https://kinsen.example.ts.net/mcp')
    expect(text).toContain('url = "https://kinsen.example.ts.net/mcp"')
    expect(text).not.toContain('//mcp')
    expect(screen.queryByText(/Remote access must use HTTPS/)).toBeNull()
  })

  it('warns when a non-loopback address is plain HTTP', () => {
    render(<McpHttpConnectionGuide />)
    fireEvent.change(screen.getByLabelText('MCP server address'), { target: { value: 'http://100.64.0.5:3004' } })
    expect(screen.getByText(/Remote access must use HTTPS/)).toBeInTheDocument()
  })

  it('hides the snippets and explains the problem when the address is invalid', () => {
    const { container } = render(<McpHttpConnectionGuide />)
    fireEvent.change(screen.getByLabelText('MCP server address'), { target: { value: 'https://host/mcp' } })
    expect(screen.getByText(/Enter only the server address/)).toBeInTheDocument()
    expect(container.textContent).not.toContain('claude mcp add')
  })

  it('offers a copy action for each client snippet', () => {
    render(<McpHttpConnectionGuide />)
    expect(screen.getAllByRole('button', { name: /copy/i })).toHaveLength(3)
  })

  it('states that the two secrets differ and that the paired tab must stay open', () => {
    const { container } = render(<McpHttpConnectionGuide />)
    const text = container.textContent ?? ''
    expect(text).toContain('KINSEN_MCP_TOKEN is different from the bridge secret')
    expect(text).toMatch(/keep this signed-in app open and paired/i)
  })
})
