# ADR 0041 — The plugin ships a review reminder

- **Date:** 2026-09-20
- **Status:** Accepted
- **Scope:** `integrations/claude/hooks/`, `integrations/claude/install.sh`, the skill's
  `references/setup.md`, `tools/checks/skill_surface.py`, `tools/checks/skill.sh`,
  `rules/ledger.yaml` (`RULE-SURF-004`, `RULE-TEST-005`), `tools/fixtures/negative.sh`,
  `backend/app/services/skill_service.py`, the image (`backend/Dockerfile`, `.dockerignore`),
  `frontend/src/shared/claudeConnect.js`
- **Addendum to:** [ADR 0035](0035-the-skill-lives-with-the-api-it-drives.md) (the skill lives
  in this repository and installs from a ref), [ADR 0040](0040-the-server-ships-the-skill-it-speaks.md)
  (the server ships the skill it speaks, and the release hash it is compared against)

## Context

GTD works when the lists are reviewed, and the lists are reviewed when something says so.
`GET /gtd/summary` was built for exactly that consumer — the change order names a SessionStart
hook as its main one — and until now nothing shipped one. The advice in `references/setup.md`
was "a SessionStart hook can mention that a review is due", which is a sentence describing a
file the user has to write.

Two constraints shape what such a reminder can be. A **skill is not loaded until it triggers**,
so no amount of skill text can say anything at the start of a session; that is the same gap the
standing rule in `setup.md` §3 fills for task capture. And a **hook is a shell command**, not an
agent: it cannot call an MCP tool, it has no conversation to interrupt, and whatever it writes
is text at the top of somebody's terminal, in every repository, every time.

## Decision 1 — the plugin ships it, and it calls REST

`integrations/claude/hooks/hooks.json` registers one `SessionStart` command,
`hooks/runway-summary.sh`, with a 5-second timeout. Claude Code loads a plugin's
`hooks/hooks.json` by itself, so plugin users get the reminder with the skill and no further
setup — which is also why the plugin is the recommended channel (`integrations/claude/README.md`).

The script calls `GET /api/gtd/summary` for the counters and `GET /api/gtd/review` for the
review records, each with `curl -m 2` and the key in an `X-Api-Key` header — two calls of two
seconds, under the 5-second backstop. Not MCP: a hook is a process the client starts, with no
MCP session and no tool call available to it. That is not a limitation worth routing around —
both answers are counters and timestamps, the REST routes are public surface like any other,
and a tool call would need an agent turn to exist.

**Why the second route and not the summary's own `last_review`.** Reviews are recorded per
scope: a repository that declares `runway_scope` has its skill POST the review with that scope
key, and the summary answers `last_review` for the scope of the `tag` it was asked about. A
hook has no scope to ask about — `runway_scope` is a line in a repository's instructions, read
by an agent and not by a shell command — so it can only ask the unscoped summary, whose
`last_review` is `null` forever for exactly the users who review most carefully. Reading
dueness off that field would have printed a reminder at the start of every session in every
repository, permanently, for someone who had just finished a review; `GET /gtd/review` lists
every scope, and the newest record of each kind is the honest answer to "has this been
reviewed".

`install.sh` users get the script placed at `~/.claude/runway-summary.sh` and **nothing that
runs it**: that channel has no plugin manifest for Claude Code to read `hooks.json` from, and
this repository does not silently edit a user's `settings.json` (`setup.md` §1). §6 holds the
snippet to paste, with the diff shown and a yes asked for, like every other step there.

## Decision 2 — silence is the default, and "due" is a narrow word

The hook prints **at most one line** and, in every other case, nothing at all:

- `RUNWAY_URL` or `RUNWAY_API_KEY` unset or empty — the overwhelmingly common case for
  everyone who has not connected a runway;
- `curl` or `python3` missing;
- any HTTP error on either route (a 401 from a rotated key is one, a 404 from a server too old
  to answer `GET /gtd/review` is another), a timeout, a body that is not the summary or not the
  list of review records;
- nothing due.

It always exits 0. A non-zero exit from a SessionStart hook is a message of its own, and
"runway is unreachable" is not worth one.

**Due** means: no daily review recorded in the last 24 hours *and* at least one of `inbox`,
`overdue`, `due_today`, `waiting_followup_due` is non-zero; or the weekly review is older than
ten days. Both ages are **durations between UTC instants**, which is the only comparison the
hook can make correctly: a review record is a UTC stamp, the summary's `today` is the local day
of the server (`TZ=Europe/Berlin` in the deployment), and the two disagree between local
midnight and the UTC offset. Slicing the day out of the stamp and holding it against `today`
would have announced a daily review as due at 01:00 to a user who recorded one at 00:30 — the
same off-by-one the summary's own local-day arithmetic exists to avoid. "In the last 24 hours"
is a hair wider than "today" and needs no offset the hook cannot know.

The counter condition is what keeps the daily arm self-silencing — an empty inbox with nothing
overdue is a reason to say nothing, not a reason to report four zeroes. A **weekly review that
was never recorded anywhere** counts as due, and says so in words rather than in a day count.
That is the one case that keeps printing until the user does something, and it is deliberate:
never having reviewed is the most overdue a weekly review can be, and one weekly review — in
any scope — silences it for ten days. The alternative — treating "no record" as "nothing to
report" — makes the hook useless for exactly the person it is for. It is defensible only
because the record is read across scopes (Decision 1): a line nobody can silence is not a
reminder, it is the reason the hook gets deleted.

The line is **counters only**. The summary has no task titles by construction, and its one
field that holds names, `stalled_projects`, is not read. So the reminder is safe in a
repository whose sessions are logged, which is the same property `runway_scope` exists to
protect.

## Decision 3 — the environment, not the client configuration

`RUNWAY_URL` (origin only) and `RUNWAY_API_KEY`, both from the user's shell profile, both
exported in one step on the settings page (`claudeConnect.js`) and in `setup.md` §1. The key
is already there for the MCP header, and the URL joins it: a key in `settings.json` is a key
in a file people paste into issues, and two variables in two places is how one of them ends up
missing with no way to tell which.

`RUNWAY_URL` is not an application setting. Nothing in the backend reads it, so `RULE-SURF-002`
— which holds `README.md` and the `Settings` object together in both directions — is not
involved. It is a variable a **consumer** reads, in the same way `RUNWAY_API_KEY` is.

## Decision 4 — the release hash covers `hooks/`, and the zip does not

A plugin update is delivered when `version` in `plugin.json` rises, and it carries everything
under the plugin directory. `RULE-SURF-004` existed because that made a skill edit without a
bump invisible; a hook edit without a bump is the same failure with a worse consequence — skill
text is read by a model that can notice it is wrong, a shell script is executed. So
`_content_hash` in `tools/checks/skill_surface.py` now hashes `skills/` **and** `hooks/`, with
paths relative to `integrations/claude/` so the two directories are told apart inside one
digest, and the ledger statement says so.

The backend's copy of that algorithm (ADR 0040, Decision 1) follows, which means the image has
to carry the hooks as well — otherwise `GET /skill` would answer a hash that does not match
`ops/skill-release.json`, which is exactly what the post-deploy check compares. An image
missing them answers 503 rather than a confidently wrong release record, like the other two
parts of the bundle.

**The zip stays skill-only.** It exists for clients that have no plugin system (ADR 0040), and
a hook such a client cannot register is a file it cannot use. Anyone who wants the reminder
there takes the script from the repository.

## Decision 5 — the test is the rule

`RULE-TEST-005` widens to cover `integrations/claude/tests/hook_test.sh`, run by
`tools/checks/skill.sh` beside `install_test.sh`, and `tools/fixtures/negative.sh` gains two
arms: a hook edited without a version bump (`RULE-SURF-004`), and a hook that announces itself
before it has looked at anything (`RULE-TEST-005`).

The test stubs `curl` first on `PATH` and answers both routes from canned bodies, so it needs
no server, no key and no network. Its review records are built from the real clock rather than
written as fixed digits, because the hook compares durations: a stamp frozen into the file would
test a different age every day it runs. Two of its arms exist for the two ways this hook can nag
somebody who has just reviewed — a review recorded in a scope, and a review recorded an hour ago
on the other side of local midnight — and both are silence. It asserts the negative promises
— nothing without the environment, nothing on an error, nothing when nothing is due — because
those are the ones nobody notices breaking.
A reminder that has started printing a traceback at the top of every session is not reported as
a bug; it is deleted, and with it the feature.

## Consequences

- No public surface moves: REST stays **40** routes, MCP **27** tools, route guards **39**
  (30 `user` / 4 `admin` / 5 `open`). The hook is a consumer of two existing routes,
  `GET /gtd/summary` and `GET /gtd/review`.
- The plugin is **1.1.0**, and `ops/skill-release.json` records a hash over a wider tree, so
  the recorded sha256 changes for a reason that is not a skill edit. That is the intended
  meaning of the record: it names what a plugin update delivers.
- The image grows by one small directory and one layer, and `GET /skill` answers 503 on an
  image built without it. The gate builds no image (`RISK-OPS-002`), so that is caught in
  production by the post-deploy check.
- `install.sh` writes one more file into `~/.claude`, outside `skills/`. A stray executable
  *inside* `skills/runway` would be part of what Claude loads as the skill.
- The fixture suite reports **56** arms, 46 of 49 rules proven.
- Users on the plugin channel get a hook they did not ask for on their next update. It is
  silent unless `RUNWAY_URL` is exported, which nothing else in the setup needed until now, so
  the default for an existing installation is no change at all.

## Alternatives considered

- **A server-side push** (e-mail, ntfy). It is the only thing that reminds anyone without an
  open session, and it remains the right answer for the weekly review — `setup.md` §6 still
  says so. It is also a scheduler, a template, a delivery channel and a secret per user; this
  is one file and no server state.
- **A cloud agent holding the API key** to send the reminder. Explicitly warned against in
  `setup.md` §6 before this change, and shipping one would have reversed that advice.
- **Print the stalled projects too.** It is the most useful line in a weekly review and the one
  piece of the summary with names in it. In a logged repository a project name is exactly what
  `runway_scope` exists to keep out, and a hook cannot ask.
- **Let the skill do it.** A skill is not loaded until it triggers, so it would have to be a
  standing rule in the user's global instructions — which costs context in every session of
  every project, to produce a line a three-second `curl` produces for free.
- **Have the hook call the MCP tool.** There is no session to call it from, and adding one
  would make session start depend on an agent turn.
- **A `RUNWAY_SCOPE` variable so the hook could ask for its repository's scope.** The scope is
  a property of a repository and the variable would be a property of a shell profile, so it
  would be wrong in every repository but one. Reading the records across scopes needs nothing
  from the user at all.
- **A `last_review_any` field in the summary, to keep the hook at one call.** It would put a
  field on a public response for one consumer's convenience, and `GET /gtd/review` already
  answers exactly that question. The second call costs two seconds of budget that the 5-second
  backstop has.
- **`hooks.json` with no timeout, relying on `curl -m 2`.** The curl timeout is the real one;
  the 5-second entry in `hooks.json` is the backstop for everything else the script could do
  wrong, and a backstop that is only in one of the two places is not one.
