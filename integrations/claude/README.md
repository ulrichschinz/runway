# runway skill for Claude

An [Agent Skill](https://code.claude.com/docs/en/skills.md) that lets Claude run Getting
Things Done on a runway server through runway's MCP surface: look up and capture tasks
from any repository, offer tasks when commitments come up in conversation, clarify the
inbox, daily and weekly review, project planning with the Natural Planning Model.

This directory is a Claude Code **plugin**. It ships the skill only. It does not ship the
MCP connection, because every runway instance has its own URL and API key; the one-time
setup is described in `skills/runway/references/setup.md`.

## Deploying and keeping it up to date

One principle governs all of this: **the repository is where the skill is developed,
`~/.claude` is where it is used.** What an agent runs on must be a released state that
somebody chose to install — never a symlink into a working tree, where an unfinished edit
or a checked-out feature branch would silently change the agent's behaviour.

There are three parts to deploy. They are versioned differently, so keep them apart:

| Part | Where it lives | How it is updated |
|---|---|---|
| The skill (this directory) | `~/.claude/skills/runway` or the plugin cache | plugin update, or `install.sh` |
| The MCP connection | user scope of Claude Code, key in `RUNWAY_API_KEY` | once; only when URL or key change |
| Personal setup: standing rule, permissions, profile | `~/.claude/CLAUDE.md`, `~/.claude/settings.json`, `~/.config/runway/profile.md` | by hand; see `skills/runway/references/setup.md` |

### First installation

1. **Connect the server** (once per machine). Put the API key from runway's settings page
   into `RUNWAY_API_KEY` (shell profile; GUI apps do not see shell variables), then:

       claude mcp add --scope user --transport http runway https://<host>/api/mcp \
         --header 'X-Api-Key: ${RUNWAY_API_KEY}'

   The single quotes matter: the placeholder is stored, not the key. Check with
   `claude mcp get runway` from any directory.

2. **Install the skill** — pick one channel and stay with it:

   **a) As a plugin (recommended).** Needs `.claude-plugin/marketplace.json` at the
   repository root.

       claude plugin marketplace add ulrichschinz/runway
       claude plugin install runway@runway

   The skill is then called `runway:runway`; it still triggers by itself from its
   description.

   **b) With the install script**, for people who have the repository checked out or do
   not use plugins:

       integrations/claude/install.sh                # committed state of HEAD
       integrations/claude/install.sh --ref v1.4.0   # a tag, branch or commit

   The script exports the skill from a **git ref** (`git archive`), so uncommitted edits
   are never installed. It refuses to write through a symlink, keeps the previous copy in
   `~/.claude/backups/runway-skill.previous`, and records what it installed in
   `~/.claude/skills/runway/.installed`.

   Do not use both channels at once; the agent would see two skills with the same job.

3. **Personal setup**: standing rule, permissions and profile from
   `skills/runway/references/setup.md`. Without the standing rule the agent only offers
   tasks when the skill happens to be loaded already.

4. **Start a new Claude session** and try "was ist offen?" or `/runway daily`.

### Staying up to date

- **Plugin channel.** Updates are driven by `version` in
  `.claude-plugin/plugin.json`: no bump, no update.

      claude plugin marketplace update runway
      claude plugin update runway@runway            # restart the session afterwards

  Marketplaces can also be set to update automatically at startup; the version bump is
  still what makes a new skill arrive.

- **Script channel.**

      git pull
      integrations/claude/install.sh --check        # exit 1 = a different version is available
      integrations/claude/install.sh

  `--check` prints installed and available as `<version> <commit>`. Rolling back is
  `install.sh --ref <older tag or commit>`.

- **Skill and server belong together.** The skill tolerates an older server (it treats
  newer operations as "if present" and says what the server cannot do). A skill that is
  older than the server simply does not use the new operations. So the safe order is:
  deploy the server, then update the skill. When in doubt, install the skill from the tag
  the server was built from.

- **What an update never touches**: the MCP connection, your standing rule, permissions
  and profile. Read the release notes for new operations worth adding to the permission
  allow-list (`references/setup.md`, section 2) — a new read operation that is not allowed
  will prompt on every call.

### Releasing a change (maintainers)

1. Change the skill together with the API change it belongs to, in the same commit.
2. Bump `version` in `.claude-plugin/plugin.json` — patch for wording, minor for new modes
   or newly used operations, major when the skill stops working with older servers.
3. Test as described under "Testing a change".
4. Merge to the default branch; tag releases with the server version. Plugin users get the
   update on their next marketplace update, script users on their next `install.sh`.

### Other clients

claude.ai and other agents that support Agent Skills: zip `skills/runway/` from a release
tag and upload it; the runway MCP server has to be connected there as well. Updating means
uploading the new zip. (Untested so far.)

## How the skill is built

    skills/runway/SKILL.md                 always loaded when the skill triggers (~150 lines)
    skills/runway/references/
      conventions.md    how GTD lists map onto runway; contexts; dates; operation table
      clarify.md        inbox processing, one item at a time
      daily-review.md   five-minute review, one numbered screen, shorthand answers
      weekly-review.md  get clear / get current / get creative, plus the 15-minute reset
      planning.md       Natural Planning Model on top of the project plan endpoints
      setup.md          MCP connection, permissions, standing rule, profile, reminders
    .claude-plugin/plugin.json             plugin manifest; bump `version` on every change
    install.sh                             installs a git ref into ~/.claude (no symlinks)

Design decisions worth knowing before changing anything:

- **Progressive disclosure.** Only the `description` in the frontmatter is always in the
  model's context; it decides whether the skill triggers. `SKILL.md` is read when it does;
  a reference file is read only when its mode runs. Keep everyday operations in `SKILL.md`
  and rituals in `references/`.
- **The skill explains why, not just what.** Instructions carry their reason ("a tag means
  clarified, because the inbox is defined as no project and no tag"), so the model can
  handle cases the text did not foresee. Avoid bare MUST/NEVER rules.
- **It refers to operations by what they do**, with today's route next to it
  (`references/conventions.md`, "Which operation for what"). MCP tool names are FastAPI
  operation ids and a public surface; every route named there has to exist.
- **It degrades gracefully.** Newer operations (summary, tickler, tag removal, filters)
  are used "if present"; on older servers the skill falls back or says plainly what the
  server cannot do. It never works around a gap by deleting and recreating tasks.
- **Server semantics it depends on**: inbox = no project and no tag; `next`, `waiting`,
  `someday` as plain tags; contexts as `@tags`; `wait` hides a task (tickler), `scheduled`
  carries follow-up dates; empty string clears a field; projects cannot be renamed and
  unknown project names are accepted silently. If one of these changes, the skill changes
  in the same commit.
- **Contexts are the main filter.** There is deliberately no work/private split; GTD keeps
  one system and filters by context at the moment of choice. `runway_scope` exists as an
  opt-in for repositories whose conversations are logged.
- **What is not in the skill.** Proactive task suggestions need a standing rule in the
  user's always-loaded instructions (a skill is not loaded until it triggers), and
  reminders need a hook or a server-side digest (a skill never starts by itself). Both are
  described in `setup.md`, neither can be shipped as skill text.
- **Personal data stays out.** User conventions live in `~/.config/runway/profile.md`,
  the repository link is one line (`runway_project:`) in that repository's instructions.

## Testing a change

There is no automated test for skill behaviour. The cheap check that has worked: give a
fresh agent the skill path, a user utterance ("/runway daily", "todo: …") and the rule
"read-only tools only; write down the write calls you would make", and ask for a report on
where the text was unclear or forced a guess.
