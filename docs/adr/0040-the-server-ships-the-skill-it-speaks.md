# ADR 0040 — The server ships the skill it speaks

- **Date:** 2026-09-20
- **Status:** Accepted
- **Scope:** `be/feature/skill` (`routers/skill.py`, `services/skill_service.py`,
  `skill_models.py`), the image (`backend/Dockerfile`, `.dockerignore`), the deploy workflow,
  route guards, the Claude skill, docs
- **Addendum to:** [ADR 0035](0035-the-skill-lives-with-the-api-it-drives.md) (the skill lives in
  this repository and installs from a ref), [ADR 0037](0037-the-mcp-surface-is-an-allowlist.md)
  (why a new tag is not a tool)

## Context

The skill and the API are shipped as one change — that is ADR 0035, and every commit of this
series has obeyed it. What ADR 0035 did not solve is the other end: a user installs the skill from
**GitHub `main`**, and talks to a server that was deployed from some commit of `main`. Those are
two different points in time, and the skill is no longer written to survive the gap. Since
[brief 0032](../briefs/0032-list-semantics.md) it names operations directly instead of hedging with
"if present", and at 1.0 the hedges are gone entirely: a skill newer than the server calls a route
that answers 404.

The repository could only ever say what `main` holds. Nothing could say what the server the client
is *actually connected to* holds — which is the only version that matters at the moment of a call.

Two smaller gaps pointed the same way. `integrations/claude/README.md` told other clients to "zip
`skills/runway/` from a release tag and upload it (untested so far)", which is a manual step
against the wrong source. And the second change order asked for a release record; this repository
has no changelog and no release checklist, and inventing one would create a third thing to keep in
sync.

## Decision 1 — the image carries the skill, and two routes hand it out

`backend/Dockerfile` copies `integrations/claude/skills/runway` and the plugin manifest into
`/app/integrations/claude`, and `.dockerignore` admits exactly those two paths — the file is
deny-all-then-admit, so nothing else under `integrations/` enters the build context.

- `GET /skill` → `{"skill": {"name", "version", "sha256"}, "server": {"commit"}, "download"}`
- `GET /skill/runway.zip` → the skill tree as a zip with one `runway/` directory inside it

`sha256` is computed the same way `ops/skill-release.json` records it, so the running server's
answer can be compared against this repository with `jq` and nothing else. The algorithm is
**copied** from `tools/checks/skill_surface.py` rather than imported: that file is a gate script
outside the backend's import path, and a backend that imported it would make the runtime image
depend on the tooling tree. A unit test runs both over the same tree and fails when they disagree,
which is what keeps the copy a copy.

The zip is deterministic — fixed entry order, `date_time=(1980,1,1,0,0,0)`, fixed permissions — so
the same content always produces the same bytes. Without that, every rebuild would serve a
different archive for an unchanged skill, and the ETag would stop meaning "this content". It is
built once per process and cached; the tree is read-only in an image.

An image built without the admit lines still builds, starts and serves every other route. Both
routes therefore answer **503**, not 404: the path is right, this build is not.

There are two admit lines and two `COPY` lines, so an image can lose one half and keep the other —
and the halves fail differently on their own. A missing manifest has no version to read and says
so. A missing `skills/` tree has nothing to trip over: `rglob` on a directory that is not there
yields no files rather than raising, and the hash of an empty file list is the sha256 of the empty
string while the zip of one is a valid, empty archive. That would make `GET /skill` a release
record that is confidently wrong, which is worse than one that is missing, so an empty tree is
`SkillNotBundled` too.

**Where** the tree is looked up is itself a claim about the image: `/app/app/services/` is two
directories below the root that holds `integrations/claude` and `BUILD_COMMIT`. In a checkout that
branch never runs, because the repository candidate one level higher answers first — so a wrong
parent count is invisible to every test that uses the real tree, and would surface as a deployed
503 with a build commit of `dev`. The derivation is therefore a function of the module's own path
(`_app_root`), and the container tier applies it to a tmp tree shaped like the image's. It is the
only check in the gate that a miscount can fail; the next one after it is the deploy.

## Decision 2 — both routes are open

Declared `open` in `rules/route-guards.toml` with a reason, which `RULE-SEC-001` enforces.

The content is public in three independent senses: the skill text is in a public repository, the
plugin is published through a marketplace, and the commit sha names an image whose registry tags
are the same sha. The consumers are the deciding argument. A browser's `<a download>` on the
settings page cannot send a header, so an authenticated download link would be a link that does
not work. The post-deploy job reads `GET /skill` to decide whether the build it just shipped is the
one answering, and it holds no user's key. And an operator debugging a version mismatch should not
need a credential to read a version number.

Neither route takes a path parameter, a query parameter or a body. The archive is built from a
fixed file list under one directory, so there is no name for a caller to supply and nothing to
traverse. Neither reads the database, the Taskwarrior data or the caller's identity, so there is
nothing to vary by principal. The one disclosure is the build commit, recorded in
[`docs/threat-model.md`](../threat-model.md) §8 with the re-open trigger: the first field here that
is not already public.

## Decision 3 — the build commit is a file, written as the last layer

`ARG RUNWAY_COMMIT=unknown` and `RUN printf '%s\n' "$RUNWAY_COMMIT" > /app/BUILD_COMMIT`, with
`deploy.yml` passing `${{ github.sha }}`. Absent — a local build, a developer's checkout — the
route answers `"dev"`.

Not an environment variable: `RULE-SURF-002` holds `README.md` and the settings object together in
both directions, so every variable the app reads is a documented public surface, and a build stamp
is not configuration. Not `FastAPI(version=)` either: that is snapshotted by `RULE-SURF-001`, and a
sha there would make every single build a public-surface change. Last layer, so that every layer
above it stays cacheable across builds.

## Decision 4 — not an MCP tool

The router's tag is `skill`, which is not on the allowlist in `backend/app/main.py`. That is the
fail-closed behaviour ADR 0037 chose, working as intended rather than an omission, and a test says
so by name.

It is also the right answer on its own terms. An agent that could call this tool is already
connected to the server and already has the skill; a tool that returns a zip it cannot install is
noise in every tool list. The consumers are a browser, `curl`, and a CI job — none of them speak
MCP.

## Decision 5 — `GET /api/skill` is the release record

There is no changelog and no release checklist in this repository, and the second change order
asked for a record. The running server is a better one than a file: it cannot drift from what is
deployed, because it *is* what is deployed. `integrations/claude/README.md` now says so in the
release section, and the post-deploy check (brief 0042) reads it.

## Consequences

- Two routes, both open: 40 routes, 39 guard declarations, 30 `user` / 4 `admin` / **5** `open`.
  The MCP surface does not move — still 27 tools.
- The image grows by the skill text (~60 KB) and gains a layer.
- **Two channels for the skill, deliberately.** The plugin (`claude plugin install runway@runway`)
  tracks GitHub and carries hooks and the marketplace update path; the zip tracks the server and
  carries no update mechanism at all. The plugin stays the recommended channel for Claude Code;
  the zip exists for clients that have no marketplace, and for anyone who needs the version that
  matches a particular server.
- A `.dockerignore` that stops admitting the skill produces an image that passes every check and
  answers 503 on one route. The gate cannot see that — it builds no image (`RISK-OPS-002`) — so it
  is caught in production, by the post-deploy check.
- The zip is skill-only. When the plugin starts shipping hooks ([brief 0043](../briefs/0043-the-review-reminder.md)) the hash covers them
  too, and the zip still does not: a hook is a Claude Code plugin mechanism, and the zip is for
  clients that have no plugins.

## Alternatives considered

- **Leave it at "install from the tag the server was built from".** It is correct advice and
  nobody follows it, because finding that tag means knowing which commit is deployed — which is
  exactly the fact that had no answer before `GET /skill`.
- **Serve the skill from the SPA's nginx as a static file.** No backend code, but the frontend
  image is built from `./frontend` and would need its own copy of the skill, and the version and
  hash would then come from a third place. The server that speaks the API is the one that should
  answer for the skill.
- **Guard the routes with an API key.** It would break the settings-page link (a `<a download>`
  sends no header) and the post-deploy check (no key), and it protects text that is public in a
  public repository anyway.
- **Generate the zip at build time and copy it in.** Slightly faster per request, but it puts the
  archive's determinism in the Dockerfile, where no test can reach it. The image carries the files;
  the process owns the format.
- **Put the commit in an env var or in `FastAPI(version=)`.** Both are snapshotted public surfaces
  (`RULE-SURF-002`, `RULE-SURF-001`); a per-build value in either would make every deploy a surface
  change.
