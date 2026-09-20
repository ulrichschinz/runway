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
 * The one command that registers this deployment with Claude Code.
 *
 * It takes no key — deliberately. The earlier snippet form substituted the user's own key
 * into a JSON block, which put a live credential into a clipboard, into screenshots, and
 * into `~/.claude.json` in plain text. Single quotes keep `${RUNWAY_API_KEY}` a placeholder
 * that the shell expands per call, so rotating the key is one edit to `~/.zshenv`.
 *
 * `--scope user` because a GTD system is not per-repository, and the skill's permission
 * rules are written against the server name `runway`.
 */
export function mcpAddCommand(origin) {
  return `claude mcp add --scope user --transport http runway ${mcpUrl(origin)} \\
  --header 'X-Api-Key: \${RUNWAY_API_KEY}'`
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
    // Claude Code registers a remote server from the command line; see mcpAddCommand for
    // why this tab is a command with a placeholder rather than a config with a key.
    'Claude Code': mcpAddCommand(origin),
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
