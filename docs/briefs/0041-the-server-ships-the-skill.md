# Change Impact Brief 0041 — The server hands out the skill it speaks

| Field | Value |
|---|---|
| **Requested outcome** | The skill and the API ship as one commit (ADR 0035), but they are *installed* from two different points in time: the user's plugin comes from GitHub `main`, and the server answering their calls was deployed from whatever commit `main` held when it was last built. That gap was survivable while the skill hedged every new operation with "if present". At 1.0 the hedges are gone — a skill newer than its server calls a route that answers 404 — so the version that matters is the one the server carries, and until now nothing could say what that was. `GET /skill` says it: the skill version, its content hash and the commit the image was built from. `GET /skill/runway.zip` hands out that exact skill as a deterministic zip, which is what a client with no plugin marketplace installs, what the settings page links (C-2), and what the post-deploy check reads to confirm the build it just shipped is the one answering (C-3). It also settles two loose ends: the README's "zip `skills/runway/` from a release tag (untested so far)" was a manual step against the wrong source, and the second change order asked for a release record in a repository that has neither a changelog nor a release checklist — the running server is now that record. |
| **Owning unit** | `be/feature/skill` (`routers/skill.py`, `services/skill_service.py`, `skill_models.py`, both test tiers — a new unit, scaffolded), `be/app` (`main.py`, the mount), `ops` (image, `.dockerignore`, deploy workflow, snapshots, structure baseline), `rules` (route guards, ledger count), `integrations` (the skill, 1.0.0), `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (a whole new feature is `make scaffold KIND=backend-feature`, and a new REST endpoint is a router — it becomes an MCP tool only if its tag is on the allowlist, and `skill` is not), §4 (`be/feature/skill` is granted `be/services`, `be/adapters/db`, `be/di`, `be/leaves` and withheld `be/adapters/task`; it uses none of them, which is why `backend/app/dependencies.py` keeps a fan-in of 6), §5 (REST is externally consumed: two new paths in `ops/surfaces/openapi.json` and the count in this contract moves with them; the MCP snapshot does **not** move), §7 (`RULE-SEC-001`: two new routes are two new declarations, and `open` needs a reason) |
| **Governed by** | **[ADR 0040](../adr/0040-the-server-ships-the-skill-it-speaks.md)** — the two routes, the open guard and its reason, the `BUILD_COMMIT` file, the deterministic zip, why this is not an MCP tool, and why `GET /api/skill` is the release record. [ADR 0035](../adr/0035-the-skill-lives-with-the-api-it-drives.md) is what this completes: the skill lives with the API, and now travels with it. [ADR 0037](../adr/0037-the-mcp-surface-is-an-allowlist.md) is why a router with a new tag adds no tool. [ADR 0029](../adr/0029-the-scaffold-generator.md) is why the first commit of this unit was generated. |
| **Rule IDs introduced** | None. No gate rule changes. The one ledger edit is the sentence in `RISK-SEC-005` that counts guard declarations against served routes. |
| **Entry points** | [`backend/app/routers/skill.py`](../../backend/app/routers/skill.py) `skill_info`, `skill_zip`; [`backend/app/services/skill_service.py`](../../backend/app/services/skill_service.py) `_app_root`, `_candidates`, `_root`, `_skill_files`, `_content_hash`, `_commit`, `skill_info`, `_zip_bytes`, `SkillNotBundled`; [`backend/app/skill_models.py`](../../backend/app/skill_models.py) `SkillInfo`, `SkillRelease`, `ServerBuild`; [`backend/Dockerfile`](../../backend/Dockerfile) (the two `COPY` lines and the `BUILD_COMMIT` layer); [`.dockerignore`](../../.dockerignore) |
| **Affected public surfaces** | **REST (S1):** two new routes, `GET /skill` and `GET /skill/runway.zip`; 38 → **40**. Both are additions; no existing operation changes a byte. **MCP (S2):** **unchanged at 27** — the router's tag is `skill`, which is not on the allowlist, and a test asserts that by name. **Route guards:** 37 → **39**, both `open`, so the breakdown goes 30 `user` / 4 `admin` / 3 `open` → 30 / 4 / **5**. **Container image:** it now carries `integrations/claude/skills/runway`, the plugin manifest and `/app/BUILD_COMMIT`; `:latest` and `:<sha>` are unchanged as a promise. **Env vars, SPA routes, storage keys:** none move — the build commit is a file precisely so that `RULE-SURF-002` is not involved. **Claude skill** 0.9.0 → **1.0.0**. |
| **Known dependents** | `backend/app/main.py` mounts the router. Nothing else in the application imports this unit, and the unit imports nothing from the application but its own models. The consumers are outside: the settings page (C-2), the post-deploy job (C-3), and a human running `curl`. The MCP surface has no consumer here by design. `tools/checks/skill_surface.py` is not imported but is coupled: it computes the same hash, and a unit test fails when the two drift. |
| **Uncertain / dynamic areas** | `RISK-MCP-001` — the index derives one `mcp_tool` node per route, so `./run impact` reports `skill_info` and `skill_zip` as tools; they are not, and `ops/surfaces/mcp-tools.json` is the count source (`RULE-DOC-001`, ADR 0037). This commit is the clearest instance of that over-inclusiveness so far. `RISK-OPS-002` — nothing in the gate builds or runs the production image, so "the skill is actually in the image" cannot be proven here; it is proven after the deploy, which is what C-3 automates. `BLIND-TEST-001` — the routes are exercised through the ASGI client, so no import-derived test edge exists for `routers/skill.py`; the coverage is real and is in `test_skill.py`. `RISK-TEST-001` — the container tier cannot run in the gate on arm64; run by hand, see Pre-checks. |
| **Analogous implementations** | [Brief 0025](0025-bake-the-compose-into-the-image.md) — the same move, one layer down: the image carries the file it is responsible for (`ops/deploy/docker-compose.yml`), admitted by name in the deny-all `.dockerignore`, which is why the build context is the repository root and why this one needed no context change. [Brief 0022](0022-the-scaffold-generator.md) — what `make scaffold` emits and what it deliberately leaves to the author. [Brief 0029](0029-adopt-the-claude-skill.md) — the skill's release record (`ops/skill-release.json`) and the hash this route re-computes. |
| **Delivery Pattern** | **New Capability** (a new unit, both test tiers, guard declarations, snapshot, ADR) carrying the **Security or Operability Change** obligations that an `open` route brings: the guard is declared with a recorded reason, the disclosure is written into the threat model with a re-open trigger, and the routes are shown to take no caller input at all. Not a Public-Surface Migration: nothing existing changes, so there is nothing to expand → migrate → switch → contract. |
| **Required tests** | Unit (`test_skill.py`, 20): `TestTheZip` — two builds with a cleared cache are byte-identical; the entry list is exact and sorted; `runway/SKILL.md` is the repository's bytes; every entry carries the fixed 1980 timestamp (the thing that makes a rebuild deterministic). `TestTheMetadata` — the version equals both `plugin.json` and `ops/skill-release.json`; the hash equals the release record; a missing `BUILD_COMMIT` reads `dev` and a present one is stripped and returned; the download path carries the `/api` prefix. `TestTheHashAgrees` — the backend's copy of the hash and `tools/checks/skill_surface._content_hash` agree on the repository tree, which is what licenses the duplication. `TestNotBundled` — both routes answer 503, not 404, when `_root()` finds nothing. `TestHalfBundled` — the other way an image loses the skill: the manifest arrived and `skills/` did not, which `rglob` reports as "no files" rather than as an error, so without a guard both routes would answer 200 with the sha256 of the empty string and a valid, empty zip; both answer 503 instead. `TestTheRoutes` — both answer without a credential; the zip is served as `application/zip` with a versioned `attachment` filename and the release hash as its ETag; the metadata's own `download` path fetches a zip that contains the skill. `TestNotAnMcpTool` — neither operation id is in `mcp.tools`, and no tool name starts with `skill_`. Container (`test_skill.py`, 5): the module and both routes are present in the image's assembled application (read from the served schema, not `app.routes`); `_app_root` applied to a module at `<root>/app/services/skill_service.py` yields `<root>`, and the module's own constants are derived from it — the parent count is the one thing only this tier can pin, because in a checkout the image candidate is dead code and an off-by-one would stay green everywhere and surface as a deployed 503; a bundle laid out the way the Dockerfile lays it out is then found through the real candidate walk (`_APP_ROOT` moved to the tmp tree, `_root` not replaced), versioned, stamped from its `BUILD_COMMIT` and zipped; and a root that exists nowhere raises `SkillNotBundled` rather than guessing. |
| **Intended scope** | The `be/feature/skill` unit and its two routes, the image changes that put the skill inside it, `RUNWAY_COMMIT` in `deploy.yml`, the two guard declarations, both test tiers, the OpenAPI snapshot, the skill at 1.0.0 (the "other clients" paragraph in `setup.md` §1 and the three `integrations/claude/README.md` sections it replaces), ADR 0040, and the sentences that state a route or guard count. **Not** in scope and coming later in this PR: the settings-page card that links the download (C-2), the `verify-deploy` job that reads `GET /skill` after every deploy (C-3), the root `README.md`'s "Use runway from Claude" rewrite and `STATUS.md` (C-4), and the SessionStart hook, which is what makes the release hash cover `hooks/` as well (C-5). Also not in scope: any authentication on these routes, any parameter on them, and shipping `install.sh`, the plugin tests or the integration README in the image — the zip is the skill, not the repository. |
| **Base revision** | `074d8cd` |

## Behaviour change

None. Both routes are new, every existing operation answers exactly as before, and no snapshot
except `openapi.json` moves. What changes is what an image contains and what a deploy passes to
`docker build`.

The four decisions worth reviewing:

- **Two open routes, taking the count from three to five.** The content is public three times over —
  the skill text is in a public repository, the plugin is on a marketplace, and the commit sha names
  an image whose registry tags are that same sha. The deciding argument is the consumers: a
  browser's `<a download>` cannot send a header, and the post-deploy job holds no user's key. Both
  declarations carry their reason in `rules/route-guards.toml`, `docs/security.md` names them among
  the open routes, and `docs/threat-model.md` §8 gains the disclosure as its seventh abuse case, with
  the re-open trigger written down: the first field here that is not already public. Neither route
  takes a path parameter, a query parameter or a body, and the archive is built from a fixed file
  list under one directory — so there is nothing to traverse and nothing to vary by principal.
- **503, not 404, when the skill is missing.** A `.dockerignore` that stops admitting the skill
  produces an image that builds, starts, passes every check and serves every other route. The one
  route that depends on the missing files has to be loud about *this build*, not about the path.
- **The hash is copied, not imported.** `tools/checks/skill_surface.py` is a gate script outside the
  backend's import path, and importing it would make the runtime image depend on the tooling tree.
  The copy is licensed by a test that runs both over the same tree and fails when they disagree
  (adversarial arm 3 below: four tests red).
- **The build commit is a file written as the last layer.** Not an env var (`RULE-SURF-002` would
  make it a documented public surface, and a build stamp is not configuration), not
  `FastAPI(version=)` (`RULE-SURF-001` snapshots it, and a sha there makes every build a
  public-surface change). Last, so every layer above stays cacheable. Absent, the route answers
  `dev`, which is what a developer's checkout and a local `docker build` both get.

## Pre-checks

- Unit tier: **637 passed** (617 before; 20 new). No existing test changes its expectation.
- Container tier by hand (D25), against `/opt/homebrew/bin/task` **3.5.0**:
  `cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`
  → **81 passed** (76 before; 5 new). This item touches no Taskwarrior semantics; the run is here to
  prove the new unit assembles in the tier that runs against the real binary. CI's x86_64 run is the
  authoritative one.
- `./run surfaces` reported drift in S1 alone and matched after the update: `openapi.json` gains two
  paths and three schemas, **111 lines, insertions only**. `mcp-tools.json` is byte-identical, which
  is the allowlist's fail-closed behaviour observed rather than assumed.
- `make scaffold KIND=backend-feature NAME=skill` generated the unit; three of its outputs were then
  replaced or reverted, each deliberately. (1) The generated guarded route became the two open ones.
  (2) The scaffold's `absorb_hub_growth` raised `backend/app/dependencies.py` from 6 to 7 in
  `ops/structure-baseline.toml`, because a generated router imports `get_current_user`; these routes
  do not, so the baseline is restored to **6** and `./run verify` boundaries reports 0 hub
  regressions at that number. A ratchet that is raised for a dependent that does not exist is worse
  than no ratchet. (3) The generated container test asserts `"/skill" in {route.path for route in
  app.routes}`, which is false for *every* mounted router under the pinned FastAPI — `app.routes`
  holds one opaque `_IncludedRouter` per `include_router` call and no paths — so it would have passed
  for a feature that was never mounted. It reads the served schema instead. That is a defect in
  `tools/scaffold.py`'s template, not in this feature; it is recorded here and left for a commit that
  owns the generator.
- Adversarial, each a temporary edit reverted immediately
  (`scratchpad/adv-c1.sh`, `scratchpad/adv-c1.log`; the last two added after review and run by
  hand, `scratchpad/mut-container.log`, `scratchpad/mut-halfbundle.log`), over `test_skill.py`
  (20 unit, 5 container):
  - **The `skill` tag joins the MCP allowlist**: **1 red** plus `RULE-SURF-001` red on S2. The
    "not a tool" claim is enforced twice, by the test and by the snapshot.
  - **Zip entries keep the mtime `docker build` gave them** (`ZipInfo.from_file`): **1 red**. The
    determinism test is the one that would catch a rebuild serving different bytes for identical
    content — the failure that would make the ETag and the release hash disagree.
  - **The hash copy drifts** (hash the file name instead of its path): **4 red**, including the
    agreement test and the ETag. The duplication is only safe while this stays red.
  - **The routes require a credential after all** (`Depends(get_current_user)` on `skill_info`):
    **3 red**. `RULE-SEC-001` would also fail, in the other direction, against the `open`
    declaration.
  - **The image is built without the skill** (the repository root dropped from the candidate list,
    which is what a `.dockerignore` regression looks like from inside the process): **15 of 18 red**,
    every one of them a 503. The three survivors are the tests that supply their own root.
  - **The in-image path is off by one** (`_app_root` returns `parents[1]`, which points the image
    lookup at `/app/app/integrations/claude` and `/app/app/BUILD_COMMIT`): **1 of 5 container red**,
    and **0 of 20 unit** — which is the point. In a checkout the image candidate is dead code and
    the repository candidate answers, so this mutation is invisible to every other test in the
    repository and would first appear as a deployed 503 with a build commit of `dev`. The container
    tier applies the derivation to a tmp tree shaped like the image's, which is the only assertion
    that can fail on it before the deploy does.
  - **The half-bundled image is accepted** (the empty-tree guard in `_skill_files` removed):
    **2 of 20 unit red**. Without it, an image that carries the manifest but not `skills/` answers
    200 with the sha256 of the empty string and a 22-byte empty zip — the one failure mode where
    the release record is wrong rather than merely absent. C-3 would catch it in production by
    comparing the hash; these two tests catch it before the image is built.
- Not made executable here: that the *built image* carries the skill. The gate builds no image
  (`RISK-OPS-002`), and `backend/Dockerfile.test` has `./backend` as its context, so no test tier can
  see `integrations/`. `docker build -f backend/Dockerfile .` was not run locally either: the image
  is `linux/amd64` and this machine is arm64 (`RISK-TEST-001`). The proof is a production read after
  the deploy — `curl -fsS https://runway.agentic-reach.com/api/skill` — which C-3 turns into a job
  that runs on every deploy and fails when the commit, version or hash does not match this
  repository.

## Skill

**1.0.0**, the version at which the last fallback is gone. `references/setup.md` §1 gains the
paragraph for clients that are not Claude Code: download `https://<host>/api/skill/runway.zip`, the
copy that matches the version your server speaks, and install it there — with the sentence that
makes it honest, that the skill is useless without the runway MCP server connected in the same
client. The zip carries the seven skill files and nothing else; `install.sh`, the plugin manifest,
the tests and the integration README are repository furniture, not skill text.

`integrations/claude/README.md` changes in three places. "Skill and server belong together" now
names the zip as the direct answer to "which version does my server want" and states what 1.0
requires: a server with the operations of ADR 0036–0039 — the tickler, the validated task filters,
the scoped lists, the summary, the review timestamps and the project status. Against anything older
this is not a degraded skill, it is a broken one, and saying so is more useful than a graceful
degradation the skill no longer performs. "Releasing a change" stops promising a tag as the record
and names `GET /api/skill` instead: there is no changelog and no release checklist here, and the
running server cannot drift from what is deployed because it *is* what is deployed. "Other clients"
replaces the manual "zip `skills/runway/` from a release tag … (untested so far)" with the route,
and states what is deliberately not promised: **not claude.ai**, whose remote connectors
authenticate by OAuth or not at all, and runway has no OAuth. That is a statement about the
connector, not about the zip.

No operation table row is added: these routes are not MCP tools, so the skill has no way to call
them and `references/conventions.md` would be naming something the model cannot use. The permissions
block in `setup.md` §2 is unchanged for the same reason.

## Counts

REST 38 → **40**, MCP tools **27, unchanged**, route guards 37 → **39** (30 `user` / 4 `admin` /
5 `open`). Updated in `AGENTS.md` §5, the route breakdown and the schema-versus-declaration
paragraph in `docs/threat-model.md` §1, the open-route list in `docs/security.md`, and the sentence
in `rules/ledger.yaml` that states them (`RISK-SEC-005`). `RISK-MCP-002` and `README.md` state the
MCP count and do not move. `docs/plan/STATUS.md:15` is a dated record of what production served in
September and is left as it stands.
