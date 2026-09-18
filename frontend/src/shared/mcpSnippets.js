/**
 * The MCP client configuration this deployment hands its users, as pure strings.
 *
 * WHY THIS EXISTS. These snippets were previously inline in `views/SettingsView.vue`, and
 * every one of them was wrong: they pointed at `https://your-host/mcp` over the deprecated
 * SSE transport, when the backend is only reachable under `/api` and the SSE transport could
 * not complete a handshake behind that prefix at all. A user's only route to the correct
 * value was to copy a snippet, watch it fail, and guess. See ADR 0033.
 *
 * Two consequences, both deliberate:
 *
 * 1. The host is not a placeholder. `window.location.origin` is where the user already is,
 *    so the snippet is copy-paste correct for THIS deployment rather than a template.
 * 2. It is a pure function in the shared layer, so it is tested. A component is not, and a
 *    string that is wrong in the same way for four weeks is exactly what tests are for.
 */

/** The MCP endpoint, absolute. `/api` is the prefix nginx proxies to the backend. */
export function mcpUrl(origin) {
  return `${origin.replace(/\/+$/, '')}/api/mcp`
}

/**
 * Client configuration snippets, keyed by the tab that shows them.
 *
 * `X-Api-Key` is used rather than `Authorization: Bearer` because both work and the Bearer
 * form is a dated shim (SHIM-SEC-006) that will be removed.
 */
export function mcpSnippets(origin, apiKey) {
  const url = mcpUrl(origin)
  const key = apiKey ?? '<your-api-key>'

  return {
    // Native remote-server support: transport type plus static headers.
    'Claude Code': `{
  "mcpServers": {
    "runway": {
      "type": "http",
      "url": "${url}",
      "headers": {
        "X-Api-Key": "${key}"
      }
    }
  }
}`,
    // Claude Desktop's config takes a command, not a URL, so a remote server is reached
    // through the mcp-remote wrapper. The key goes in `env` and is referenced, so the
    // header argument carries no space — which some shells and Windows handle badly.
    'Claude Desktop': `{
  "mcpServers": {
    "runway": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "${url}",
        "--header", "X-Api-Key:\${RUNWAY_API_KEY}"
      ],
      "env": { "RUNWAY_API_KEY": "${key}" }
    }
  }
}`,
    curl: `# Add a task to your inbox
curl -X POST ${origin.replace(/\/+$/, '')}/api/inbox \\
  -H "X-Api-Key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"description": "My task", "priority": "H"}'`,
  }
}
