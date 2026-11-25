# Change Impact Brief 0072 — One JWT algorithm, a key that is not a placeholder, and patched dependencies

| Field | Value |
|---|---|
| **Requested outcome** | Milestones **M7.1** and **M7.2** of the security remediation plan (findings **SEC-002** and **SEC-005** of the November 2026 review), ordered by Uli on 2026-11-24. M7.1: the signing algorithm fixed in code to the one symmetric algorithm actually used, never chosen by deployment configuration; the `JWT_SECRET` check aimed at origin and entropy beyond its minimum length — published defaults, empty, short and known example values refused, a random secret generated in the runbook and never in the repository; either a migration to a maintained compatible JWT library or waiting for an upstream fix, never a non-existent version ("3.5.1"); the two CVE preconditions kept as negative tests — wrong key type, algorithm confusion and empty or unsuitable keys must fail. Acceptance (plan M7.1): lock and runtime version agree; the chosen primary source documents the fix or the non-applicable configuration; a token with an unexpected algorithm or key type is refused. M7.2: `python-multipart` to at least 0.0.18 (the first fix upstream names for CVE-2024-53981) or a newer compatible version, in an isolated dependency change; intent file, hash lock and image changed together; the lock/intent rule and every REST and MCP test run; the existing counter-evidence stays documented (no current route calls the multipart parser) and a future multipart upload needs size, file and parser regressions. Closing criteria (plan §5): SEC-002 — fixed algorithms, a suitable secret check, a maintained or pinned dependency decision; SEC-005 — runtime version ≥ 0.0.18 or a demonstrably newer fixed state, locks consistent. |
| **Owning unit** | `be/leaves` — `backend/app/auth.py` (token encode/decode), `backend/app/startup_checks.py` (the key and algorithm refusals), `backend/app/config.py` (comments only; the `jwt_algorithm` field stays, see *Affected public surfaces*). `ops` — `backend/requirements.txt`, `backend/requirements.lock`, `backend/requirements-dev.lock` (the image installs the lock), `rules/shims.yaml` (`SHIM-SEC-010`). `tools` — `tools/surfaces.py` (its throwaway boot secret), `tools/installed_matches_lock.py` (review round 1: the runtime image's closure check). `ops` also — `.github/workflows/deploy.yml` (runs it before `deploy`). `docs` — this brief, ADR 0046, ADR 0021 (a superseded-note), `README.md`, `.env.example`, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`. `rules/waivers.yaml` (the S105 scope narrowed), `backend/AGENTS.md` (one surprise). `tests` — `backend/tests/conftest.py` (a per-run random secret), `backend/tests/unit/test_jwt_hardening.py` (new), `backend/tests/unit/test_dependency_fixes.py` (new), `backend/tests/container/test_installed_dependencies.py` (new), `backend/tests/unit/test_security_wave.py`, `backend/tests/unit/test_session_revocation.py`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §4 (layers: `be/leaves` depends on nothing internal but `app.config`), §5 (**env vars** are a public surface documented in README, `RULE-SURF-002`; the REST/MCP surfaces and the DB schema do not move), §6 (`rules/shims.yaml` is read by the gate; `RISK-GOV-001`: no independent approval), §8 (no new suppression), §9 (the META-RULE: **not engaged** — no rule's check, ledger entry or fixture changes), §10 (transitive dependencies are not pinned as a whole — the lock is); [`backend/AGENTS.md`](../../backend/AGENTS.md) (tests at the `_run` seam; the container tier is the real image's dependency set). Supply chain: `RULE-DEP-001` (import check), `RULE-DEP-002` (licences), `RULE-DEP-004` (hash-pinned lock), `RULE-DEP-005` (lock equals intent), [`tools/lock.sh`](../../tools/lock.sh) as the only way to change a lock. |
| **Governed by** | New: [ADR 0046](../adr/0046-the-jwt-library-and-the-signing-key.md) (the JWT library and the signing key). Amends [ADR 0021](../adr/0021-supply-chain-pinning.md) (its *python-jose 3.3.0 → 3.5.0* decision is superseded by the migration away from it) and [ADR 0018](../adr/0018-cors-startup-refusal-and-the-inbox-shim.md) (the startup refusal grows). Respected: [ADR 0044](../adr/0044-credential-lifecycle-jwt-password-and-api-key.md) (the claim set — `sub`, `iat`, `exp`, `jti`, `auth_version` — and `SHIM-SEC-008` are unchanged; only the library that signs and verifies them changes), [ADR 0004](../adr/0004-pin-transitive-mcp.md) (`mcp==1.29.0` and `fastapi-mcp==0.4.0` stay pinned; `mcp` is what already pulls PyJWT and `python-multipart` into the closure). |
| **Rule IDs introduced** | None. `SHIM-SEC-010` is added to `rules/shims.yaml` (`RULE-SEC-002` holds its expiry). The new refusals are startup behaviour held by unit tests, not gate arms. |
| **Entry points** | Boot: `main.lifespan` → `startup_checks.run_all()`. Every authenticated request: `dependencies.get_current_user` → `auth.decode_token`. Every login and password change: `auth.create_access_token`. Every request with a body: FastAPI's body parsing, which reaches `python-multipart` only for a route that declares `Form`/`File` (none does). Operator: `python -m app.startup_checks` (new), which runs the same checks against the environment and prints a verdict without the secret. |
| **Affected public surfaces** | **Env vars: none added or removed.** `JWT_ALGORITHM` keeps being read, but only `HS256` is accepted: any other value refuses to start (it could only ever have selected another HMAC algorithm or broken the boot; the shipped compose files do not pass it, and `docs/operations.md` records that the host `.env` declares `JWT_SECRET` only). Removing the field now would break every local `.env` that still sets it (`pydantic-settings` refuses an unknown key in a dotenv file), so it is a dated shim, `SHIM-SEC-010`, with the contract step its own change. `JWT_SECRET`: values that started before and now refuse — the `.env.example` placeholder and any value published in this repository, a public key in PEM, SSH, JWK or base64-DER form, a value that is one short unit repeated, and a value whose estimated entropy is under 80 bits. README documents both. **Tokens: unchanged on the wire** — HS256 compact JWS with the same claims; a token issued by the previous image verifies under this one and the reverse (rollback keeps sessions). **REST/OpenAPI, MCP tools, DB schema, SPA: unchanged**; `ops/surfaces/*` byte-identical. |
| **Known dependents** | From `./run impact` (index `current`, revision `3e3faab33828`, 1884 nodes / 3158 edges): `auth.py` → `dependencies.py`, `main.py`, `models.py`, `routers/auth.py`, `services/password_reset.py`, transitively every router and `task_service.py`; governed by ADR 0044. `config.py` → twelve modules directly. `startup_checks.py` → `main.py` only; protected by `test_security_wave.py` and every TestClient suite through `main.py`. `requirements.txt`, `requirements.lock`, `Dockerfile` → unit `ops`, no import-derived test protection (`BLIND-TEST-001`); `BLIND-OPS-001` for the image. |
| **Uncertain / dynamic areas** | **The production secret.** This repository cannot see the deploy host's `JWT_SECRET`. A value that passed the old check (≥ 32 characters, not one of five defaults) and fails a new one refuses to start after the deploy. Mitigation: the new refusals only reject values that are publicly known or degenerate (each is a forgeable key, the same reasoning as SEC-1), and `python -m app.startup_checks` runs the new checks against the host `.env` with the new image *before* the deploy (`docs/operations.md`). **The entropy estimate** is an estimate: it refuses repetition and tiny alphabets, it cannot tell a memorable phrase from a random string — that limit is written into ADR 0046 and `docs/threat-model.md`. **`mcp` uses PyJWT too** (its OAuth helpers, unused here): the PyJWT bump moves a transitive of `mcp`; `test_mcp_session.py` and the two MCP suites must stay green. |
| **Analogous implementations** | `startup_checks.assert_jwt_secret_is_safe` (finding SEC-1: refuse to serve rather than warn); brief 0067's argon2-cffi decision (a maintained library replacing an unmaintained one, pinned to a release older than two weeks, verified against vectors the old one produced); `SHIM-SEC-008` (an accepted old shape with a dated removal). |
| **Delivery Pattern** | **Security or Operability Change** (failure scenario, control, adversarial red tests written first and observed failing), in two commits so that M7.2 is the isolated dependency change the plan asks for. **Public-Surface Migration** for `JWT_ALGORITHM` only: expand and switch now (the variable is accepted with its one legal value and refused otherwise), contract deferred to `SHIM-SEC-010`. |
| **Required tests** | Plan §6 names *Unit*, *ASGI/REST* and *Supply chain* for this package. *Unit:* the secret refusals (published defaults, every `JWT_SECRET` literal in a tracked file, empty, short, PEM/SSH/JWK/DER public keys, repetition, low entropy; a generated secret of every documented shape passes); the algorithm refusal; `decode_token` against `alg: none`, `HS384`, `HS512`, `RS256`, lower-case `hs256`, an embedded `jwk`/`jku`/`kid` header, a token signed with an empty key, a token signed with the public key as HMAC secret; interop with a hand-built standard HS256 token (the previous library's format). *ASGI/REST:* the same hostile tokens against `GET /auth/me` and an MCP-exposed route — 401 for each; a multipart body to a JSON route reaches no multipart parser. *Supply chain:* every pin in `requirements.txt` equals the installed version; `python-multipart` ≥ 0.0.18 installed and locked; no `python-jose` in either lock and none imported by the app; the CVE-2024-53981 input against the installed parser (bounded log events); in the **container tier**, every package of the image's lock installed at exactly its locked version, and none of the dropped ones. |
| **Intended scope** | M7.2 in full (commit 1). M7.1 in full (commit 2): migration to PyJWT, the fixed algorithm, the secret checks, the negative tests, the docs. The `JWT_ALGORITHM` contract step **deferred** to `SHIM-SEC-010`. **Not** in scope: rotating any real secret, M7.3/M7.4, a `fastapi`/`starlette`/`mcp` bump, any production action. |
| **Base revision** | `3e3faab` (`security/m5-mcp`) |

## Failure scenarios

1. **The copied example (SEC-002, origin).** An operator follows `.env.example`, which ships
   `JWT_SECRET=replace-with-a-long-random-string` — 33 characters, not one of the five defaults the check
   knew, so the process starts. Anyone who reads this public repository signs `{"sub": "admin", …}` with
   that string and is the administrator of that deployment.
2. **The wrong key type (CVE-2024-33663 / CVE-2026-85394).** `JWT_SECRET` is set to a public key — a PEM
   block copied from another service, or its base64 DER body. The attacker knows the public key, signs an
   HS256 token with it as the HMAC secret, and the verifier accepts it. python-jose up to 3.5.0 has no
   fixed release; its guard does not recognise the DER form.
3. **The empty or degenerate key (CVE-2026-120459).** An HMAC verified with an empty key, or with
   `xxxxxxxx…` of length 32, is a key anyone can guess at the first try.
4. **The configurable algorithm.** `JWT_ALGORITHM` comes from deployment configuration. It can only
   select what the library accepts for a string key, but it is a knob that does nothing useful and makes the
   verifier's algorithm a function of the environment.
5. **The vulnerable parser (SEC-005).** `python-multipart` 0.0.12 is installed in the image. CVE-2024-53981
   (and, as OSV lists on 2026-11-25, seven later advisories up to 0.0.31) needs a route that parses
   `multipart/form-data`. None does today; the first upload route would make it reachable on the day it
   ships.

## Decisions

See ADR 0046 for the reasoning; in short:

- **Migrate to PyJWT 2.15.1.** python-jose's last release is 3.5.0 (2025-05-28); no fixed release for
  either CVE exists, and "3.5.1" is not a real version. PyJWT is maintained, already in the image (a
  dependency of `mcp`, at 2.13.0), and covers this application's use exactly (HS256 encode/decode, required
  claims). 2.13.0 itself carries advisories fixed in 2.14.0/2.15.0 (OSV, 2026-11-25), so the pin is 2.15.1
  (2026-09-28, older than two weeks, no OSV advisory). Dropping python-jose removes `ecdsa` (CVE-2024-23342,
  unfixed), `rsa` and `pyasn1` from the image.
- **`HS256` is a constant, `config.JWT_SIGNING_ALGORITHM`**; `auth.py` encodes and decodes with it, never `settings.jwt_algorithm`.
  `JWT_ALGORITHM` is still read so an existing `.env` keeps booting, and anything but `HS256` refuses to start.
- **The secret check refuses by origin and by shape**: empty; shorter than 32 characters; a value
  published in this repository (the defaults, `.env.example`, README, the test and capture secrets — the test
  suite now generates its secret per run, and a test proves every `JWT_SECRET` literal in a tracked file is
  refused); a value containing a placeholder fragment; a public key (PEM, OpenSSH, JWK, base64 DER); one
  short unit repeated; an estimated entropy under 80 bits (length × empirical Shannon entropy per character —
  `openssl rand -hex 16`, the weakest documented generator, never fell under 89 in 200 000 draws).
- **`python-multipart` 0.0.33** (2026-10-31): fixes CVE-2024-53981 and every later advisory OSV lists;
  0.0.34 is nine days old and not taken.

## Control

**Commit 1 — M7.2, the isolated dependency change.** `backend/requirements.txt`: `python-multipart`
0.0.12 → 0.0.33, with the reason; both locks regenerated by `./run lock` (`uv pip compile` keeps every
other pin: the diff is that one package and its two hashes, which match PyPI's published SHA-256 for
`python_multipart-0.0.33-py3-none-any.whl` and the sdist). No application code changes: the application
never imports the package. The M7.1 part (the JWT library, the algorithm, the secret checks) is the second
commit.

**Commit 2 — M7.1.** `backend/requirements.txt`: `python-jose[cryptography]==3.5.0` → `PyJWT==2.15.1`;
the locks lose `python-jose`, `ecdsa`, `rsa`, `pyasn1`, `six` and move `pyjwt` 2.13.0 → 2.15.1 (hashes match
PyPI's for the wheel and the sdist). `backend/app/config.py`: `JWT_SIGNING_ALGORITHM = "HS256"`, a module
constant; the `jwt_algorithm` field stays, commented, as `SHIM-SEC-010`. `backend/app/auth.py`:
`jwt.encode`/`jwt.decode` from PyJWT with `algorithm=`/`algorithms=[JWT_SIGNING_ALGORITHM]` and
`options={"require": ["exp", "sub"]}`; `jwt.PyJWTError` → `None`; the claim handling after it unchanged.
`backend/app/startup_checks.py`: `KNOWN_DEFAULT_SECRETS` grows to every published value,
`PLACEHOLDER_FRAGMENTS`, `looks_like_key_material` (PEM, OpenSSH, JWK, DER via `_is_der_structure`),
`smallest_period`, `estimated_entropy_bits`, `assert_jwt_algorithm_is_fixed` in `run_all`, and `main()` for
`python -m app.startup_checks`. No import is added between internal modules (fan-in unchanged).
`tools/surfaces.py` and `backend/tests/conftest.py` generate their key per run. `rules/shims.yaml`:
`SHIM-SEC-010`. `rules/waivers.yaml`: the S105 waiver's scope loses `tools/surfaces.py`, whose suppression
is gone (narrowed, not widened). No snapshot, budget, baseline, rule or new suppression changed.

## Test evidence

Run on 2026-11-25 on an arm64 Mac. "Before" is each new test file run against the **unchanged production
code and dependencies** of its commit's base (only the test file added).

| Tier | What | Before | After |
|---|---|---|---|
| Supply chain | `test_dependency_fixes.py::TestPythonMultipartIsPastItsAdvisories` × 5 — installed ≥ 0.0.18 and ≥ 0.0.31, both locks ≥ 0.0.31, the CVE-2024-53981 input (50 000 CRLF before the first and after the last boundary) parsed with < 100 log records | **red, all 5**: `(0, 0, 12) >= (0, 0, 18)`; the parser logged **100 000** records (`Skipping leading CR/LF at …`), one per byte — the advisory's mechanism, observed | green: 0.0.33 installed, the same body parsed with < 100 records |
| Supply chain | `TestTheVenvIsTheIntent` × 2 — every direct pin equals the installed version; the runtime lock pins what the intent names | green (positive control) | green |
| ASGI | `TestNoRouteParsesMultipart` × 3 — no route declares `Form`/`File`; a multipart body to `POST /auth/login` is 422 with the parser never called; positive control: a throwaway `Form` route does reach the recorder | green (the counter-evidence of the review, now a regression test) | green |
| Container | `tests/container/test_installed_dependencies.py` × 2 — every package of `requirements-dev.lock` installed at exactly its locked version; installed `python-multipart` ≥ 0.0.31 | — (added with the fix) | green in the local venv; in the image: see *Gate* |
| Unit (origin) | `test_jwt_hardening.py::TestTheSecretIsRefusedByOrigin` × 6 — the scan finds the four known published values; every `JWT_SECRET` literal in the repository's published text refuses to boot; four dressed-up placeholders | **red, 5 of 6**: bootable published values `a-literal-value-that-must-not-ship` (a negative fixture), `replace-with-a-long-random-string` (`.env.example`), `surface-capture-secret-long-enough-to-boot`, `test-secret-long-enough-to-pass-the-startup-check`; every placeholder started | green |
| Unit (shape) | `TestTheSecretIsRefusedByShape` × 19 — PEM public key, PEM private key, RSA and EC public keys as base64 DER, OpenSSH, JWK, five repetitions, two tiny alphabets, empty, the refusal never contains the value; four documented generators × 200 draws each pass | **red, 14**: every PEM/DER/SSH/JWK value, every repetition and both tiny alphabets started (`DID NOT RAISE`); empty and the generators green | green |
| Unit (algorithm) | `TestTheAlgorithmIsFixed` × 9 — `JWT_ALGORITHM` = `HS512`, `HS384`, `none`, `RS256`, `hs256`, empty refuses to start; `HS256` starts; with the setting at `HS512` the issued token's header is `HS256` and an HS512 token is refused | **red, 8**: all six values started; the server issued an **HS512** token and accepted an HS512 token when configured so | green |
| Unit + ASGI (tokens) | `TestEveryOtherTokenIsRefused` × 4 — positive control: a hand-built HS256 token (python-jose's format) is accepted, an issued token verifies by hand with `hmac`; 13 hostile tokens (`alg` none/None/HS384/HS512/hs256/missing/list, RS256 with an attacker key, an empty key, a public-key PEM as HMAC key, an embedded `jwk`, a `jku`/`kid`, a wrong secret) refused by `decode_token` and **401** on `GET /auth/me` and `GET /tasks` (MCP-exposed) | green — python-jose with the pinned `algorithms` list already refused each; the review said so. These pin the property across the library change | green under PyJWT |
| Supply chain (library) | `TestTheJwtLibrary` × 7 — no `jose` in `sys.modules` after importing the app and no `import jose` in `backend/app`; neither `python-jose` nor `ecdsa` pinned in the intent or either lock; `PyJWT==2.15.1` a direct pin; the installed PyJWT refuses a PEM and a DER public key as HMAC key | **red, 6**: jose imported; pinned in all three files; no PyJWT pin; **PyJWT 2.13.0 accepted the DER public key** (GHSA-p4g4-x82p-q773) — the version line matters | green |
| Unit (operator) | `TestTheOperatorCheck` × 2 — `python -m app.startup_checks`: exit 1 with the reason and without the value; exit 0 for a generated key | — (added after the red run; `main()` did not exist) | green |
| Interop (one-off, not in the suite) | python-jose 3.5.0 in a scratch venv: a token it minted → `auth.decode_token` (PyJWT) gives the claims; a token `create_access_token` minted → `jose.jwt.decode` gives `sub`/`auth_version` | — | both directions OK — sessions survive the deploy and a rollback |
| Changed expectations | `test_security_wave.py::test_a_real_secret_passes` used `"x" * 32` as the *passing* secret; now a generated one (one character repeated is refused). `test_session_revocation.py` builds and reads tokens with PyJWT instead of python-jose (`get_unverified_claims` → a local `_unverified_claims`) | — | green; nothing else in the suite changed |

At the M7.1 red run, 33 of the 45 tests in `test_jwt_hardening.py` failed against the unchanged code.

**A process note.** The first draft of the published-value scan walked the whole checkout. In the main
checkout that includes the operator's local, gitignored `.env`, `users.db` and `data/`: the scan read them
in memory, and its failure message printed the **local development** `JWT_SECRET` (generated by
`make bootstrap`) into the implementing agent's session. Nothing from `data/` or `users.db` was printed,
copied or committed. The scan was replaced before any commit by an allowlist of published paths that
never enters those files. The local dev key should be regenerated (delete `.env`, run `make bootstrap`);
it is not a production key.

## Results

- **SEC-005: closing criterion met in this repository** ("Runtimeversion ≥ 0.0.18 bzw. nachweislich neuer
  Fixstand; Locks konsistent"): 0.0.33 in intent and both locks (`RULE-DEP-005` green), installed in the venv
  (tested) and in the runtime image's pip layer (see *Gate*); the advisory's mechanism observed on 0.0.12
  and gone on 0.0.33. The counter-evidence (no multipart route) is a test. Isolated in commit 1.
- **SEC-002: closing criterion met in this repository** ("feste Algorithmen, geeignete Secretprüfung,
  gepflegte/fixierte Dependencyentscheidung"): HS256 is a constant; the secret is refused by origin and
  shape; python-jose is replaced by a maintained, pinned PyJWT; the CVE preconditions are negative tests.
  Acceptance (plan M7.1): lock and runtime version agree (tested); the primary sources (OSV/GHSA, PyPI and
  the GitHub releases of python-jose, the CNA records named in the review) are cited in ADR 0046; tokens
  with an unexpected algorithm or key type are refused (unit and ASGI). **Whether the production
  `JWT_SECRET` passes the new checks is not visible from here** (deferred).
- **Public surfaces:** REST/OpenAPI, MCP tools, DB schema and SPA unchanged (`RULE-SURF-001` green with no
  snapshot update). Env vars: none added or removed; `JWT_ALGORITHM` now refuses anything but `HS256`, and
  README says so (`RULE-SURF-002` green). Tokens are byte-compatible in both directions.
- **Rollback:** the previous image runs on the same data (nothing on disk changes) and accepts the tokens
  this one issued. It reinstates python-jose 3.5.0, python-multipart 0.0.12 and the weaker key check.
- **Residual risks / waivers:** none removed or downgraded — SEC-002/SEC-005 were review findings, not
  ledger entries. `SHIM-SEC-010` added. The entropy estimate's limit (a memorable phrase passes) is written
  into ADR 0046 and `docs/threat-model.md` §3.

### Deferred, with trigger

- **The production secret — superseded by merge blocker 1 below** (review round 1: the image this step
  named exists only after the merge, which deploys).
- **`SHIM-SEC-010` contract** — remove `JWT_ALGORITHM` (field, README line, check) after README has announced
  it for a release and the host `.env` is confirmed not to set it; expires 2027-05-31.
- **Owner sign-off** on `SHIM-SEC-010`, the narrowed S105 waiver scope and the `backend/AGENTS.md` bullet
  (`RISK-GOV-001`: not independent).
- **The full container tier** (`RISK-TEST-001`) — CI on amd64 runs `test_installed_dependencies.py` with the rest.
- **`SHIM-SEC-006` expired today (2026-11-25)** — outside this package (briefs 0070 and 0071 flagged it);
  `RULE-SEC-002` fails the gate from 2026-11-26 unless it is removed or re-approved. Not touched.
- **Library bumps** — a PyJWT bump must re-run `test_jwt_hardening.py`, `test_session_revocation.py` and the
  three MCP suites (`mcp` uses PyJWT); python-multipart's re-runs `test_dependency_fixes.py`.

### Gate

- `make check` on the base `3e3faab`: **GREEN** (41 s; 1415 unit tests). On commit 1 (`fcdfdec`, M7.2) after
  `make fix`: **GREEN** (40 s; 1425). On commit 2 (M7.1) after `make fix`: **GREEN** (41 s of 180 s; 1472
  unit tests, 779 frontend).
- **The image.** A full `docker build --platform linux/amd64` of `backend/Dockerfile` and
  `backend/Dockerfile.test` on this arm64 host fails in the Taskwarrior builder stage (`pacman -Syu` under
  emulation, exit 1) — the `RISK-TEST-001` limit, so **neither image was built here**. What was run instead,
  on the runtime image's own base (`python:3.12-slim@sha256:7a8b47…`, `linux/amd64`): `pip install
  --require-hashes -r requirements.lock` installs `PyJWT 2.15.1` and `python-multipart 0.0.33`, and no
  `python-jose`, `ecdsa`, `rsa`, `pyasn1` or `six` (`import jose` → `ModuleNotFoundError`); with
  `requirements-dev.lock` installed the same way, `tests/container/test_installed_dependencies.py`,
  `test_dependency_fixes.py`, `test_jwt_hardening.py`, `test_session_revocation.py`, `test_mcp_session.py`
  and `test_security_wave.py` — **191 passed**. That is the pip layer both Dockerfiles run, not the image;
  CI's amd64 container tier is what runs the new container test inside the real test image.
- `make verify` on `3b59202` in a clean, bootstrapped detached worktree: **GREEN** (302 s of 600 s) — unit
  1472 passed, 779 frontend, 60 fixture arms passed, 0 failed, 47 of 50 executable rules proven able to fail.
  The **container tier was skipped** on this arm64 host (`RISK-TEST-001`: "archlinux publishes no arm64
  image and pacman fails under" emulation) and was **not** observed here — so the new
  `tests/container/test_installed_dependencies.py` has run in this repository only in the venv and on the
  amd64 Python base above, not inside the built test image.
- `3b59202` was committed right after a `make check` that reported **RED** with one violation, whose line
  was not captured (a scripting slip: the commit was chained on `grep` finding a verdict, not on GREEN).
  The only thing that ran between that and the next `make check` on the same tree, **GREEN**, was `make fix`
  — which refreshes the untracked index and changed no tracked file — so the violation was, by inference,
  index freshness after the brief's last edit. `make verify` above is on that same commit.


## Review round 1

Ten reviewer issues on `0a895ea`, each re-checked here before acting. Planned before the code; the
*Gate (review round 1)* below records what was run.

| # | Issue | Verdict | What changes |
|---|---|---|---|
| 1 | *important* — the repetition check is bypassed by one appended character; `password`×4+`!`, `Tr0ub4dor&3!`×3+`x`, `x`×16+`a…p` and the sequential alphabet boot | **Confirmed** (reproduced: all four pass `run_all()` on `0a895ea`). `smallest_period` measures exact periodicity only, and the per-character Shannon estimate ignores order | A redundancy estimate: greedy LZ77 over the value and over its successive character differences; only characters that are not a copy (≥ 3) of earlier text are charged, at the value's per-character entropy. Refused under **56 bits**. In 500 000 draws of `openssl rand -hex 16` (the weakest documented form) the minimum was 65.4; the reviewer's four values and the other degenerate shapes tested score 12–46. Red cases: the four values, `0123456789abcdef`×2+`z`, a descending run, `aB3$`×8+`Q` |
| 2 | *minor* — hex DER, raw EC points, Ed25519 raw, JWKS and JWK arrays boot; a JWKS boots and then every login raises `InvalidKeyError` | **Confirmed** for hex DER, uncompressed EC points (hex/base64), JWKS and JWK arrays. **Rejected** for a raw Ed25519 key and a compressed EC point: 32 random bytes *are* an Ed25519 public key, and about half of all 33-byte strings starting `02`/`03` decompress to a point — refusing them refuses generated secrets (`openssl rand -hex 32` is a documented generator) | `looks_like_key_material` also hex-decodes; an uncompressed point is refused only if it lies on P-256, P-384, P-521 or secp256k1 (random bytes never do); any JSON object or array with a `kty` or `keys` member anywhere. And boot now runs PyJWT's own `HMACAlgorithm.prepare_key` on the secret, so the boot check and the library cannot disagree again |
| 3 | *minor* — the published-literal scan misses quoted, YAML and JSON forms and walks a hand-written allowlist | **Confirmed** (the regexes give `[]` for all four forms) | Regexes accept an optional quote and the `KEY: value` / `"KEY": "value"` forms; the file set is `git ls-files` (tracked files only, so `.env`, `users.db`, `data/` and the untracked evidence are never opened). Guard on the guard for each form, built at run time so the probe values are not themselves literals in a tracked file |
| 4, 9 | *minor* — nothing automated checks the **runtime** image's installed versions | **Confirmed** | `tools/installed_matches_lock.py` (stdlib only): every pin of a lock installed at exactly its version, `python-multipart` ≥ 0.0.31, no `jose`/`ecdsa` importable. `deploy.yml` runs it inside the pushed backend image against its own `/app/requirements.lock` before the deploy job (`deploy` needs it). A unit test runs it against the venv (green) and a doctored lock (red) |
| 5 | *minor* — `docker run --env-file` is not the environment compose gives the backend; wrong host path | **Confirmed** (`ops/deploy/docker-compose.yml` passes `JWT_SECRET=${JWT_SECRET}` by interpolation; `/opt/services/runway` is the service directory) | The check runs through `docker compose run --rm --no-deps backend …` from `/opt/services/runway` |
| 6 | *important* — the pre-deploy check needs an image that only exists after the merge, and the merge deploys | **Confirmed** | A **pre-merge** procedure: copy this branch's `startup_checks.py` and `config.py` to the host and mount them read-only over the deployed image's copies in a `docker compose run`; both are self-contained (stdlib, `pydantic-settings`, PyJWT's `HMACAlgorithm`, present in the deployed image at 2.13.0). Made a **merge blocker** in *Deferred*. ADR 0046's rejected-alternative rationale corrected |
| 7 | *important* — SEC-005 must ship as an isolated dependency PR; here it is a commit on the same branch | **Confirmed**, not fixable inside this package's rules (one branch; no new branch, no PR, no merge) | Recorded as a **merge blocker** owner decision: merge `fcdfdec` alone first (it is the first commit on top of the base), or record the bundling decision and its rollback consequence (rolling M7.1 back also reinstates python-multipart 0.0.12) |
| 8 | *minor* — operations.md says "a public key in any form" | **Confirmed** | Reworded to the forms checked, and the forms deliberately not (raw Ed25519, compressed points) named |
| 10 | *minor* — the Decisions bullet names `auth.py` for the constant | **Confirmed** | `config.JWT_SIGNING_ALGORITHM` |

### Test evidence (review round 1)

"Before" is the new tests run against the unchanged code of `0a895ea` (tests added first).

| Tier | What | Before | After |
|---|---|---|---|
| Unit (redundancy) | `test_a_value_that_is_mostly_repetition_is_refused` × 8 — the reviewer's four values, `0123456789abcdef`×2+`z`, a descending run, `aB3$`×8+`Q`, `p@ssw0rd-`×3+`2026!` | **red, all 8** (`DID NOT RAISE`) | green |
| Unit (key material) | `test_a_hex_der_public_key_is_refused` × 6 (RSA/EC × hex, upper-case hex, spaced hex); `test_a_raw_uncompressed_ec_point_is_refused` × 12 (P-256, P-384, P-521, secp256k1 × hex, base64, base64url); `test_a_jwk_set_or_array_is_refused` × 4 (JWKS, JWK array, nested, empty set); `test_boot_and_the_library_agree` | **red, all 23** | green |
| Unit (negative control) | `test_random_bytes_shaped_like_a_point_are_not_refused` — 200 × `04` ‖ 64 random bytes in hex boot; `test_every_documented_generator_passes` (4 × 200) unchanged | green | green |
| Unit (scan) | `test_the_scan_sees_every_way_a_value_is_written` × 6 — `KEY="…"`, `export KEY='…'`, `KEY: …`, `KEY: "…"`, JSON, compose list | **red, 5 of 6** against the old regexes (only the bare compose form matched) | green; the scan now walks `git ls-files` (1216 tracked files), every literal it finds is refused |
| Unit (runtime image check) | `test_dependency_fixes.py::TestTheRuntimeImageCheck` × 5 — the script fed on stdin as deploy.yml does: green against a lock built from what this interpreter has installed (a bootstrapped venv installs the intent, not the lock — the first version compared against `requirements-dev.lock` and failed `make verify` in a fresh worktree, see *Gate*); exit 1 for a pin at another version, a lock moved back to python-multipart 0.0.12, an importable `jose`, a missing or tiny lock | **red** (the script did not exist) | green |
| Pre-merge procedure (one-off, not in the suite) | This branch's `startup_checks.py` and `config.py` alone in a scratch venv with **PyJWT 2.13.0** (the deployed image's version) and `pydantic-settings` 2.15.0: `python -m app.startup_checks` → `ok` for `openssl rand -base64 48`, refused for a JWKS and for `password`×4+`!` | — | as expected — the two files are self-contained against the deployed image's library set. Not run against the deployed image itself |

## Merge blockers (owner, before merging this branch)

1. **Run the pre-merge check on the host** (`docs/operations.md`, *The signing key*): this branch's
   `startup_checks.py` and `config.py` mounted over the deployed image's copies in a `docker compose run`
   from `/opt/services/runway`. `ok` → merge; refused → rotate `JWT_SECRET` first. Merging deploys, and a
   refusal after the merge is an outage. A host action this repository cannot perform.
2. **SEC-005 isolation** (plan §1 and M7.2: "in einem isolierten Dependency-PR"). Either merge `fcdfdec`
   (M7.2, the first commit on top of the base) on its own first — a branch pointing at `fcdfdec`, its own
   PR — and this branch after it; or record here and in ADR 0046 that the owner accepts the bundle, knowing
   that rolling M7.1 back also reinstates python-multipart 0.0.12. The implementing agent may not create
   branches or PRs, so this is not done here.
