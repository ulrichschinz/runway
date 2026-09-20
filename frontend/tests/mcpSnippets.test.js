import { describe, expect, it } from 'vitest'

import { mcpSnippets, mcpUrl } from '../src/shared/mcpSnippets.js'

/**
 * These pin the two things the old inline snippets got wrong, and that no test could catch
 * while they lived in a component: the `/api` prefix, and the transport.
 *
 * The backend is reachable only through nginx's `/api/` proxy, and the MCP endpoint is
 * Streamable HTTP. A snippet missing either one produces a client that cannot connect —
 * which is what shipped from the first release until 2026-09-18 (ADR 0033).
 */

describe('mcpUrl', () => {
  it('puts the endpoint under the /api prefix, which is the only way in', () => {
    expect(mcpUrl('https://runway.example.com')).toBe('https://runway.example.com/api/mcp')
  })

  it('does not double the slash when the origin carries a trailing one', () => {
    expect(mcpUrl('https://runway.example.com/')).toBe('https://runway.example.com/api/mcp')
  })
})

describe('mcpSnippets', () => {
  const snippets = mcpSnippets('https://runway.example.com', 'k3y')

  it('offers exactly the tabs the Settings page renders', () => {
    expect(Object.keys(snippets)).toEqual(['Claude Code', 'Claude Desktop', 'curl'])
  })

  it('declares the http transport, never the deprecated sse one', () => {
    expect(snippets['Claude Code']).toContain('--transport http')
    expect(snippets['Claude Code']).toContain('https://runway.example.com/api/mcp')
    expect(snippets['Claude Code']).not.toContain('sse')
  })

  it('sends the API key in the header the backend forwards — as a placeholder', () => {
    expect(snippets['Claude Code']).toContain("--header 'X-Api-Key: ${RUNWAY_API_KEY}'")
  })

  it('never inlines the key into the Claude Code tab, which lands in ~/.claude.json', () => {
    expect(snippets['Claude Code']).not.toContain('k3y')
  })

  it('wraps the remote server for Claude Desktop, which takes a command and not a URL', () => {
    const config = JSON.parse(snippets['Claude Desktop'])
    const server = config.mcpServers.runway
    expect(server.command).toBe('npx')
    expect(server.args).toContain('https://runway.example.com/api/mcp')
    // Referenced, not inlined: the header argument must carry no space.
    expect(server.args).toContain('X-Api-Key:${RUNWAY_API_KEY}')
    expect(server.env.RUNWAY_API_KEY).toBe('k3y')
  })

  it('every snippet is valid JSON or a shell command, never a half-substituted template', () => {
    expect(snippets.curl).toContain('https://runway.example.com/api/inbox')
    expect(snippets.curl).not.toContain('your-host')
  })

  it('falls back to a visible placeholder before the key has loaded', () => {
    const pending = mcpSnippets('https://runway.example.com', null)
    // The Claude Code tab never carries a key at all, so the placeholder is only needed by
    // the tabs that still inline one.
    expect(pending['Claude Desktop']).toContain('<your-api-key>')
    expect(pending.curl).toContain('<your-api-key>')
  })
})
