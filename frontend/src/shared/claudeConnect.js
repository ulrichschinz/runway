/**
 * The four things a user has to do once to make Claude talk to this deployment, as pure
 * strings.
 *
 * WHY THIS EXISTS. The procedure was written down three times — in the skill's
 * `references/setup.md`, in `integrations/claude/README.md`, and nowhere the settings page
 * could reach — so the page offered a JSON snippet with the user's own API key substituted
 * into it (ADR 0033) and left the rest to a README the user had not read. Two problems.
 *
 * 1. **The key.** A snippet carrying the key ends up in a clipboard, a screenshot, and
 *    `~/.claude.json` in plain text. `claude mcp add --header 'X-Api-Key: ${RUNWAY_API_KEY}'`
 *    stores the *placeholder*; the key lives in the shell, where a rotated key is one edit
 *    away from taking effect. So `mcpAddCommand` takes no key at all — there is no argument
 *    a caller could pass one in.
 * 2. **The drift.** The card repeats the standing rule and the plugin commands. Those two
 *    copies are pinned against their sources in `tests/claudeConnect.test.js`, so an edit to
 *    the skill that leaves this page behind fails the suite instead of shipping.
 *
 * Pure, in the shared layer, for the reason `mcpSnippets.js` gives: a component is not
 * tested, and a string that is wrong in the same way for four weeks is what tests are for.
 */

import { mcpAddCommand } from './mcpSnippets.js'

// Re-exported so the card, its test and the snippet tabs all name one command builder.
export { mcpAddCommand }

/** The environment variable the MCP header and the SessionStart hook both read. */
export const KEY_ENV = 'RUNWAY_API_KEY'

/**
 * The origin variable the SessionStart hook reads.
 *
 * Pinned against `integrations/claude/hooks/runway-summary.sh` in the test: the hook is a
 * shell script in another directory, nothing imports it, and a renamed variable there would
 * leave this page telling users to export something nobody reads.
 */
export const URL_ENV = 'RUNWAY_URL'

/** Shown until `/auth/apikey` has answered — the same placeholder `mcpSnippets` uses. */
const KEY_PLACEHOLDER = '<your-api-key>'

const origin_ = (origin) => origin.replace(/\/+$/, '')

/**
 * The shell line that holds the key.
 *
 * `~/.zshenv` rather than the client's own config: a GUI app does not see it, but Claude
 * Code does, and a key in `settings.json` is a key in a file people paste into issues.
 */
export function keyExportLine(apiKey) {
  return `export ${KEY_ENV}='${apiKey ?? KEY_PLACEHOLDER}'   # in ~/.zshenv, not in settings.json`
}

/** The origin the hook calls `GET /api/gtd/summary` on. Origin only, no path. */
export function urlExportLine(origin) {
  return `export ${URL_ENV}='${origin_(origin)}'`
}

/** Install the plugin — the channel that also carries the reminder hook. */
export const PLUGIN_INSTALL = `claude plugin marketplace add ulrichschinz/runway
claude plugin install runway@runway`

/** Update it later. No version bump, no update — see the integration README. */
export const PLUGIN_UPDATE = `claude plugin marketplace update runway
claude plugin update runway@runway`

/** The open download route: the skill copy that matches the server answering right now. */
export function skillZipUrl(origin) {
  return `${origin_(origin)}/api/skill/runway.zip`
}

/**
 * Verbatim `references/setup.md` section 3. A skill is loaded only when it triggers, so the
 * habit of *offering* a task has to live in the always-loaded instructions.
 */
export const STANDING_RULE = `## Aufgaben (runway)
- Entsteht im Gespräch eine Zusage, ein „ich muss noch“, ein vereinbarter nächster Schritt
  oder ein Warten auf Dritte, biete am Ende der Antwort in EINER Zeile an, dafür ein Todo
  in runway anzulegen (Skill \`runway\`). Höchstens ein Angebot je Antwort, nicht für Dinge,
  die du in derselben Session erledigst, nicht erneut nach einem Nein.
- „todo: …“ heißt: sofort anlegen, nur bei unklarem Projekt nachfragen.
- Aufgaben leben ausschließlich in runway, nie in Dateien oder Notizen.`

/** Verbatim `references/setup.md` section 4: one line per repository, in its CLAUDE.md. */
export const RUNWAY_PROJECT_LINE = 'runway_project: website-relaunch'

/**
 * The card's steps, in the only order that works: the variable has to exist before the
 * command that references it, and the skill is useless before the server is connected.
 *
 * `containsSecret` is what the view masks behind the reveal toggle. It is a property of the
 * step rather than a check on the rendered string, so the view never has to search for a
 * key it should not be handling in the first place.
 */
export function connectClaudeSteps(origin, apiKey) {
  return [
    {
      // Both variables in one step, in one file: the MCP header reads the key, the
      // SessionStart hook the plugin ships reads both (ADR 0041), and a user who exports one
      // of them today and the other after the next restart has a hook that stays silent for
      // the wrong reason.
      id: 'key',
      title: 'Put your API key and this server in the shell',
      text: `${keyExportLine(apiKey)}\n${urlExportLine(origin)}`,
      containsSecret: true,
    },
    {
      id: 'mcp',
      title: 'Connect the MCP server, at user scope so every repository sees it',
      text: mcpAddCommand(origin),
      containsSecret: false,
    },
    {
      id: 'skill',
      title: 'Install the runway skill',
      text: PLUGIN_INSTALL,
      containsSecret: false,
    },
    {
      id: 'rule',
      title: 'Add the standing rule to your global instructions (~/.claude/CLAUDE.md)',
      text: STANDING_RULE,
      containsSecret: false,
    },
  ]
}
