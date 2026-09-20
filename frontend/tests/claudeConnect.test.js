import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  KEY_ENV,
  PLUGIN_INSTALL,
  PLUGIN_UPDATE,
  RUNWAY_PROJECT_LINE,
  STANDING_RULE,
  connectClaudeSteps,
  keyExportLine,
  mcpAddCommand,
  skillZipUrl,
  urlExportLine,
} from '../src/shared/claudeConnect.js'
import { mcpUrl } from '../src/shared/mcpSnippets.js'

/**
 * The settings page is the only place a user ever sees these instructions, and the skill's
 * own `references/setup.md` is the only place they are maintained. Two copies of a setup
 * procedure drift, and the drift is invisible: both look plausible, and only one works.
 * So the copies are pinned against the source here rather than proof-read.
 *
 * The second thing pinned is the absence of the key. ADR 0033 shipped a snippet with the
 * user's own API key substituted into it, which is a credential in a copy-paste buffer, in
 * a screenshot, and in `~/.claude.json`. The command form stores the placeholder instead.
 */

const setup = readFileSync(
  new URL('../../integrations/claude/skills/runway/references/setup.md', import.meta.url),
  'utf8',
)
const integrationReadme = readFileSync(
  new URL('../../integrations/claude/README.md', import.meta.url),
  'utf8',
)

/**
 * The first fenced block below the `## <heading>` of setup.md.
 *
 * Sliced rather than split on `\n## `, because section 3's fence *contains* a `##` heading —
 * it is the markdown the user pastes into their own instructions.
 */
function fenceOf(heading) {
  const start = setup.indexOf(`\n## ${heading}`)
  expect(start, `setup.md has no section "${heading}"`).toBeGreaterThan(-1)
  const fence = setup.slice(start).match(/```[a-z]*\n([\s\S]*?)```/)
  expect(fence, `section "${heading}" of setup.md has no fenced block`).toBeTruthy()
  return fence[1].trimEnd()
}

describe('mcpAddCommand', () => {
  const command = mcpAddCommand('https://runway.example.com')

  it('points at the endpoint of this deployment, under the /api prefix', () => {
    expect(command).toContain(mcpUrl('https://runway.example.com'))
  })

  it('stores the placeholder, never the key — the key is only ever in the shell', () => {
    expect(command).toContain("'X-Api-Key: ${RUNWAY_API_KEY}'")
    // The function takes no key, so no caller can put one in by mistake.
    expect(mcpAddCommand.length).toBe(1)
  })

  it('installs at user scope over the http transport, so it works in every repository', () => {
    expect(command).toContain('--scope user')
    expect(command).toContain('--transport http')
  })

  it('does not double the slash when the origin carries a trailing one', () => {
    expect(mcpAddCommand('https://runway.example.com/')).toContain(
      'https://runway.example.com/api/mcp',
    )
  })
})

describe('the export lines', () => {
  it('names the variable the MCP header and the hook both read', () => {
    expect(KEY_ENV).toBe('RUNWAY_API_KEY')
    expect(keyExportLine('k3y')).toContain(`export ${KEY_ENV}=`)
  })

  it('carries the key when it is known', () => {
    expect(keyExportLine('k3y')).toContain("'k3y'")
  })

  it('shows a visible placeholder before the key has loaded', () => {
    expect(keyExportLine(null)).toContain('<your-api-key>')
  })

  it('sends the user to the shell profile, and says where the key must not go', () => {
    expect(keyExportLine('k3y')).toContain('~/.zshenv')
    expect(keyExportLine('k3y')).toContain('settings.json')
  })

  it('exports the origin for the hook, without a trailing slash or a path', () => {
    expect(urlExportLine('https://runway.example.com/')).toBe(
      "export RUNWAY_URL='https://runway.example.com'",
    )
  })
})

describe('skillZipUrl', () => {
  it('is the open download route of this deployment', () => {
    expect(skillZipUrl('https://runway.example.com')).toBe(
      'https://runway.example.com/api/skill/runway.zip',
    )
  })

  it('does not double the slash when the origin carries a trailing one', () => {
    expect(skillZipUrl('https://runway.example.com/')).toBe(
      'https://runway.example.com/api/skill/runway.zip',
    )
  })
})

describe('connectClaudeSteps', () => {
  const steps = connectClaudeSteps('https://runway.example.com', 'k3y')

  it('is ordered: the key exists before the command that references it', () => {
    expect(steps.map((s) => s.id)).toEqual(['key', 'mcp', 'skill', 'rule'])
  })

  it('marks exactly the one step whose text has to be masked on screen', () => {
    expect(steps.filter((s) => s.containsSecret).map((s) => s.id)).toEqual(['key'])
  })

  it('gives every step a title and a body worth copying', () => {
    for (const step of steps) {
      expect(step.title, step.id).toBeTruthy()
      expect(step.text, step.id).toBeTruthy()
    }
  })

  it('leaks the key into no step but the one declared to hold it', () => {
    const elsewhere = steps.filter((s) => !s.containsSecret)
    expect(elsewhere.some((s) => s.text.includes('k3y'))).toBe(false)
  })
})

describe('the copies of the skill setup', () => {
  it('reproduces the standing rule of setup.md section 3 verbatim', () => {
    expect(STANDING_RULE).toBe(fenceOf('3.'))
  })

  it('reproduces the per-repository project line of setup.md section 4 verbatim', () => {
    expect(RUNWAY_PROJECT_LINE).toBe(fenceOf('4.'))
  })

  it('offers the plugin commands the integration README documents', () => {
    // Whole lines, not substrings: `claude plugin install runway` is a substring of the
    // correct command and would pass a `toContain`, while installing nothing.
    const readmeLines = new Set(
      integrationReadme.split('\n').map((l) => l.trim().replace(/\s{2,}#.*$/, '')),
    )
    for (const line of [...PLUGIN_INSTALL.split('\n'), ...PLUGIN_UPDATE.split('\n')]) {
      expect([...readmeLines], line).toContain(line)
    }
  })
})
