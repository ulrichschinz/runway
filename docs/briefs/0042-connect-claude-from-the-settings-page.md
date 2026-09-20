# Change Impact Brief 0042 — Connect Claude from the settings page, without handing out the key

| Field | Value |
|---|---|
| **Requested outcome** | Everything a user needs to make Claude talk to their Runway now exists — the MCP server, the skill, the plugin marketplace, the zip download ([brief 0041](0041-the-server-ships-the-skill.md)) — and none of it is reachable from the place they are already logged in to. The settings page offered one JSON block for Claude Code and a README link. So the page gets a **Connect Claude** card: four ordered steps, each with a copy button, each generated for *this* origin. The second outcome is a defect the card could not have carried: the Claude Code tab substituted the user's own API key into the snippet it told them to paste, which puts a live credential in a clipboard, in a screenshot, and in `~/.claude.json` in plain text. That tab becomes `claude mcp add --scope user --transport http runway <origin>/api/mcp --header 'X-Api-Key: ${RUNWAY_API_KEY}'`, which stores the *placeholder*; the key lives in the shell, where rotating it is one edit rather than a re-paste. This is the settings-page half of the follow-up [ADR 0035](../adr/0035-the-skill-lives-with-the-api-it-drives.md) recorded and [brief 0041](0041-the-server-ships-the-skill.md) left open. |
| **Owning unit** | `fe/shared` (new [`claudeConnect.js`](../../frontend/src/shared/claudeConnect.js); [`mcpSnippets.js`](../../frontend/src/shared/mcpSnippets.js) gains `mcpAddCommand` and the Claude Code tab now returns it), `fe/identity` ([`SettingsView.vue`](../../frontend/src/views/SettingsView.vue) — the card, a generic `copy(text, key)` and the mask that follows the existing reveal toggle) |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 ("a frontend rule about tags, filtering or sorting" is the same class as this: strings with a rule in them go in `frontend/src/shared/`, which is pure and tested, because components are not), §4 (`fe/identity → fe/shared` is a declared edge; `fe/shared → []`, so `claudeConnect.js` may import `./mcpSnippets.js` and nothing else — and does not, which is why no new edge appears in the index), §5 (no promised surface moves: no env var the app *reads*, no SPA route, no `localStorage` key, so `ops/surfaces/spa.json` is byte-identical and `RULE-SURF-002` is not involved), [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (logic worth testing leaves the component) |
| **Governed by** | [ADR 0033](../adr/0033-the-mcp-server-nobody-could-connect-to.md) — its fifth decision, that the snippets live in the tested shared layer, is what makes this a three-line change with a test rather than an edit inside a template; the record gains a dated note that the key it still inlined is gone. [ADR 0040](../adr/0040-the-server-ships-the-skill-it-speaks.md) — the zip route the card links is open precisely so a browser `<a download>`, which sends no header, can fetch it. [ADR 0035](../adr/0035-the-skill-lives-with-the-api-it-drives.md) — the skill ships with the API it drives, which is why the card's copy of the standing rule is pinned to the skill's own `references/setup.md` rather than proof-read. |
| **Rule IDs introduced** | None. No gate rule changes, no ledger entry moves, and no negative fixture is added — the meta-rule is not engaged. |
| **Entry points** | [`frontend/src/shared/claudeConnect.js`](../../frontend/src/shared/claudeConnect.js): `KEY_ENV`, `URL_ENV`, `keyExportLine`, `urlExportLine`, `PLUGIN_INSTALL`, `PLUGIN_UPDATE`, `skillZipUrl`, `STANDING_RULE`, `RUNWAY_PROJECT_LINE`, `connectClaudeSteps`, and `mcpAddCommand` re-exported. [`frontend/src/shared/mcpSnippets.js`](../../frontend/src/shared/mcpSnippets.js): `mcpAddCommand`. [`frontend/src/views/SettingsView.vue`](../../frontend/src/views/SettingsView.vue): `connectSteps`, `stepText`, `copy`, `skillZip`. |
| **Affected public surfaces** | **None of the eight in `AGENTS.md` §5.** REST stays at 40, MCP tools at 27, route guards at 39 (30 `user` / 4 `admin` / 5 `open`); `./run surfaces` reports no drift in any of S1–S4, and `ops/surfaces/spa.json` does not move because the card is a block on an existing route with no new storage key. No skill file changes, so `integrations/claude/.claude-plugin/plugin.json` stays at **1.0.0** and `ops/skill-release.json` stays as C-1 wrote it. What *does* change for a user is the text of the Claude Code tab — a documented instruction, not a promised interface — and it changes in the direction that stops it carrying a credential. |
| **Known dependents** | `frontend/src/router/index.js` imports the view; `frontend/src/main.js` transitively. Nothing imports `claudeConnect.js` but the view and its test. The *coupling that matters is not an import*: the card repeats the standing rule from [`references/setup.md`](../../integrations/claude/skills/runway/references/setup.md) §3, the per-repository project line from §4, and the plugin commands from [`integrations/claude/README.md`](../../integrations/claude/README.md). All three are read from those files by the test and compared, so the dependency fails the suite instead of drifting quietly. |
| **Uncertain / dynamic areas** | `RISK-TEST-004` — frontend rendering is untested by decision, so "the card appears, in this order, with working copy buttons" is asserted by a human in a browser and by the shape of the data the tested module hands the template, not by a mounted component. `BLIND-TEST-001` — `SettingsView.vue` has no import-derived test protection and does not gain any; the logic that could be wrong was moved out of it, which is the mitigation this repository has chosen twice before. `BLIND-FE-001`/`BLIND-FE-002` — template-only references and dynamic imports are invisible to the index; neither occurs here. |
| **Analogous implementations** | [Brief 0026](0026-the-mcp-server-nobody-could-connect-to.md) — the move this one continues: four snippets that were wrong for four weeks because they lived in a template where nothing could test them. [Brief 0041](0041-the-server-ships-the-skill.md) — the route the download link points at, and why it is open. The `taskPayload.js` work in [brief 0031](0031-empty-string-clears.md) — the same shape of change: a rule the component was getting wrong moves into `fe/shared` with a test, and the component keeps only the rendering. |
| **Delivery Pattern** | **New Capability**, frontend only. Not a Public-Surface Migration: the Claude Code tab is instruction text rather than one of the surfaces §5 promises, so there is no consumer to expand → migrate → switch → contract for, and a user holding the old JSON block keeps a working configuration — it is the *key handling* that is worse, not the connection. It carries one obligation from the Security pattern all the same, because the change is about a credential: the key must be provably absent from everything the page emits that is not the key line itself, which is a test, not a review. |
| **Required tests** | New [`frontend/tests/claudeConnect.test.js`](../../frontend/tests/claudeConnect.test.js), **18**: `mcpAddCommand` — the endpoint carries the `/api` prefix, `--scope user` and `--transport http`, the header is the literal `'X-Api-Key: ${RUNWAY_API_KEY}'`, the function's arity is 1 so no caller can pass a key in, and a trailing slash on the origin does not double. The export lines — `KEY_ENV` is the name the MCP header and the C-5 hook both read, the key appears when known and a visible placeholder before `/auth/apikey` has answered, the comment names `~/.zshenv` and says where the key must not go, and `urlExportLine` yields an origin with no path and no trailing slash. `skillZipUrl` — the open route, trailing slash included. `connectClaudeSteps` — the order is `key, mcp, skill, rule` (the variable exists before the command that references it), exactly the `key` step declares `containsSecret`, every step has a title and a body, and no other step's text contains the key. The drift pins — `STANDING_RULE` equals the fence of `setup.md` §3 byte for byte, `RUNWAY_PROJECT_LINE` equals the fence of §4, and both plugin commands appear in `integrations/claude/README.md` as whole lines. Changed in [`frontend/tests/mcpSnippets.test.js`](../../frontend/tests/mcpSnippets.test.js): the three assertions that parsed the Claude Code tab as JSON now assert the command form, the placeholder header, and that the key is absent from that tab; the placeholder test moves to the two tabs that still inline one. |
| **Intended scope** | `claudeConnect.js` and its test, `mcpAddCommand` in `mcpSnippets.js` and the Claude Code tab that returns it, the **Connect Claude** card in `SettingsView.vue` (and the deletion of the "Replace `https://your-host`" hint below the snippet box, which has been false since ADR 0033 derived the host from `window.location.origin`), and the dated note in ADR 0033. **Not** in scope: `urlExportLine` is written and tested here but is *not* on the card — the SessionStart hook that reads `RUNWAY_URL` arrives in C-5, and a step telling a user to export a variable nothing reads yet is a step they will get wrong. The root `README.md`'s "Use runway from Claude" section, `docs/plan/STATUS.md` and ADR 0035's follow-up paragraph are C-4. No skill text changes, so no version bump; no backend, no route, no snapshot. |
| **Base revision** | `a4a43a2` |

## Behaviour change

One, deliberate, and visible to anyone who copies from the settings page.

**The Claude Code tab stops carrying the key.** It was:

```json
{ "mcpServers": { "runway": { "type": "http", "url": "…/api/mcp",
  "headers": { "X-Api-Key": "<the user's actual key>" } } } }
```

It is now:

```sh
claude mcp add --scope user --transport http runway https://<origin>/api/mcp \
  --header 'X-Api-Key: ${RUNWAY_API_KEY}'
```

Three things that are better and one that is only different. Better: the key is never rendered,
so it is never in a clipboard, a screenshot or a support ticket; the single quotes make Claude Code
store the placeholder, so rotating the key is one edit to `~/.zshenv` rather than a re-paste into
every client; and `--scope user` matches what `references/setup.md` §1 has told users to do since
the skill shipped, while the JSON block was a `.mcp.json` fragment scoped to one repository, which
a GTD system is not. Only different: a user who prefers the file form no longer finds it on this
page. The README still documents it, and `claude mcp add` writes it for them.

**The card itself adds no behaviour.** It renders data from a pure module: four steps, each with a
copy button; the key step is masked on screen behind the reveal toggle the API Key card already
owns, and copying always takes the real text — masking the display and masking the clipboard are
different jobs, and only the first one is useful. The mask is driven by `containsSecret` on the
step rather than by searching the rendered string for something that looks like a key, so the view
never has to recognise a credential to avoid showing one.

Two decisions worth reviewing:

- **`mcpAddCommand` lives in `mcpSnippets.js`, not in `claudeConnect.js`.** The card needs it and
  so does the tab; putting it in the new module and importing it back would make the two shared
  files a cycle, which `architecture.toml` forbids for good reason. It is defined where the other
  client-configuration strings are and re-exported from `claudeConnect.js`, so every caller names
  one builder. **It takes one argument.** A `mcpAddCommand(origin, apiKey)` that ignored the second
  argument would be an invitation; a test asserts the arity, which is the cheapest possible
  statement that there is no way to put a key back in.
- **The three copies are pinned, not reviewed.** The card repeats the standing rule, the project
  line and the plugin commands, because sending a user to a markdown file in a plugin directory to
  finish a setup they started in a browser is how setups get abandoned halfway. Two copies of a
  procedure drift, and the drift is invisible — both look plausible and only one works. So the test
  reads `references/setup.md` and `integrations/claude/README.md` with `node:fs` and compares. The
  plugin-command pin compares *whole lines*: the first draft used `toContain`, which passed while
  the card said `claude plugin install runway` — a substring of the correct command that installs
  nothing (adversarial arm 4 below, which was green until the assertion was fixed).

## Pre-checks

- Frontend suite: **78 passed** (59 before; 18 new in `claudeConnect.test.js`, one added in
  `mcpSnippets.test.js`). `npx eslint .` reports nothing. `npm run build` succeeds; the emitted
  bundle contains the literal `RUNWAY_API_KEY` four times and can contain no key at all, because
  the key reaches the page at runtime from `GET /auth/apikey`.
- `./run surfaces` reports **no drift**: S1–S4 all match, which is the mechanical form of "this
  commit touches no public surface". `ops/skill-release.json` and `plugin.json` are untouched, so
  `RULE-SURF-004` has nothing to check.
- Container tier by hand (D25), against `/opt/homebrew/bin/task` **3.5.0**:
  `cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`
  → **81 passed**, unchanged. This commit touches no Taskwarrior semantics and no backend file; the
  run is a control, not evidence.
- Adversarial, each a temporary edit reverted immediately (`scratchpad/adv-c2.sh`,
  `scratchpad/adv-c2.log`), over the 78-test suite:
  - **The command inlines the key again** (`mcpAddCommand(origin, apiKey)` interpolating it):
    **2 red** — the arity assertion and the "never inlines the key" assertion on the tab. This is
    the regression the commit exists to prevent, and it is caught in both places it could reappear.
  - **The standing rule drifts by one word** (`Höchstens` → `Hoechstens`): **1 red**. A user would
    have pasted a rule that still reads fine and no longer matches what the skill documents.
  - **The project line drifts**: **1 red**.
  - **The plugin command drifts from the README** (`runway@runway` → `runway`): **1 red** — and
    **green** before the whole-line fix, which is why the arm is recorded rather than dropped.
  - **The key step stops declaring `containsSecret`**: **2 red**. Without the declaration the view
    would render the key in plain text next to a hidden one, in the same card.
  - **The steps are reordered** so the key export is no longer first: **2 red**.
  - **The zip link loses the `/api` prefix**: **2 red** — the same defect class ADR 0033 was
    written about, now caught by a test instead of by a user.
- Not made executable here: that the card *renders*. `RISK-TEST-004` — the frontend has no
  component tests by decision, and this change does not reverse that decision for one card. The
  render is checked by eye in a browser after the deploy, and the copy buttons with it.

## Counts

Unchanged, all of them: REST **40**, MCP tools **27**, route guards **39** (30 `user` / 4 `admin` /
5 `open`), Claude skill **1.0.0**. No file in `AGENTS.md` §5's surface list, in `ops/surfaces/`, or
in `rules/` is touched by this commit.
