# Change Impact Brief 0072 — One JWT algorithm, a key that is not a placeholder, and patched dependencies

| Field | Value |
|---|---|
| **Requested outcome** | Milestones **M7.1** and **M7.2** of the security remediation plan (findings **SEC-002** and **SEC-005** of the November 2026 review), ordered by Uli on 2026-11-24. M7.1: the signing algorithm fixed in code to the one symmetric algorithm actually used, never chosen by deployment configuration; the `JWT_SECRET` check aimed at origin and entropy beyond its minimum length — published defaults, empty, short and known example values refused, a random secret generated in the runbook and never in the repository; either a migration to a maintained compatible JWT library or waiting for an upstream fix, never a non-existent version ("3.5.1"); the two CVE preconditions kept as negative tests — wrong key type, algorithm confusion and empty or unsuitable keys must fail. Acceptance (plan M7.1): lock and runtime version agree; the chosen primary source documents the fix or the non-applicable configuration; a token with an unexpected algorithm or key type is refused. M7.2: `python-multipart` to at least 0.0.18 (the first fix upstream names for CVE-2024-53981) or a newer compatible version, in an isolated dependency change; intent file, hash lock and image changed together; the lock/intent rule and every REST and MCP test run; the existing counter-evidence stays documented (no current route calls the multipart parser) and a future multipart upload needs size, file and parser regressions. Closing criteria (plan §5): SEC-002 — fixed algorithms, a suitable secret check, a maintained or pinned dependency decision; SEC-005 — runtime version ≥ 0.0.18 or a demonstrably newer fixed state, locks consistent. |
| **Owning unit** | `be/leaves` — `backend/app/auth.py` (token encode/decode), `backend/app/startup_checks.py` (the key and algorithm refusals), `backend/app/config.py` (comments only; the `jwt_algorithm` field stays, see *Affected public surfaces*). `ops` — `backend/requirements.txt`, `backend/requirements.lock`, `backend/requirements-dev.lock` (the image installs the lock), `rules/shims.yaml` (`SHIM-SEC-010`). `tools` — `tools/surfaces.py` (its throwaway boot secret). `docs` — this brief, the M7.1 decision record, `README.md`, `.env.example`, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`. `tests` — `backend/tests/conftest.py` (a per-run random secret), `backend/tests/unit/test_jwt_hardening.py` (new), `backend/tests/unit/test_dependency_fixes.py` (new), `backend/tests/container/test_installed_dependencies.py` (new), `backend/tests/unit/test_security_wave.py`, `backend/tests/unit/test_session_revocation.py`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §4 (layers: `be/leaves` depends on nothing internal but `app.config`), §5 (**env vars** are a public surface documented in README, `RULE-SURF-002`; the REST/MCP surfaces and the DB schema do not move), §6 (`rules/shims.yaml` is read by the gate; `RISK-GOV-001`: no independent approval), §8 (no new suppression), §9 (the META-RULE: **not engaged** — no rule's check, ledger entry or fixture changes), §10 (transitive dependencies are not pinned as a whole — the lock is); [`backend/AGENTS.md`](../../backend/AGENTS.md) (tests at the `_run` seam; the container tier is the real image's dependency set). Supply chain: `RULE-DEP-001` (import check), `RULE-DEP-002` (licences), `RULE-DEP-004` (hash-pinned lock), `RULE-DEP-005` (lock equals intent), [`tools/lock.sh`](../../tools/lock.sh) as the only way to change a lock. |
| **Governed by** | New, with the M7.1 commit: the decision record on the JWT library and the signing key. Amends [ADR 0021](../adr/0021-supply-chain-pinning.md) (its *python-jose 3.3.0 → 3.5.0* decision is superseded by the migration away from it) and [ADR 0018](../adr/0018-cors-startup-refusal-and-the-inbox-shim.md) (the startup refusal grows). Respected: [ADR 0044](../adr/0044-credential-lifecycle-jwt-password-and-api-key.md) (the claim set — `sub`, `iat`, `exp`, `jti`, `auth_version` — and `SHIM-SEC-008` are unchanged; only the library that signs and verifies them changes), [ADR 0004](../adr/0004-pin-transitive-mcp.md) (`mcp==1.29.0` and `fastapi-mcp==0.4.0` stay pinned; `mcp` is what already pulls PyJWT and `python-multipart` into the closure). |
| **Rule IDs introduced** | None. `SHIM-SEC-010` is added to `rules/shims.yaml` (`RULE-SEC-002` holds its expiry). The new refusals are startup behaviour held by unit tests, not gate arms. |
| **Entry points** | Boot: `main.lifespan` → `startup_checks.run_all()`. Every authenticated request: `dependencies.get_current_user` → `auth.decode_token`. Every login and password change: `auth.create_access_token`. Every request with a body: FastAPI's body parsing, which reaches `python-multipart` only for a route that declares `Form`/`File` (none does). Operator: `python -m app.startup_checks` (new), which runs the same checks against the environment and prints a verdict without the secret. |
| **Affected public surfaces** | **Env vars: none added or removed.** `JWT_ALGORITHM` keeps being read, but only `HS256` is accepted: any other value refuses to start (it could only ever have selected another HMAC algorithm or broken the boot; the shipped compose files do not pass it, and `docs/operations.md` records that the host `.env` declares `JWT_SECRET` only). Removing the field now would break every local `.env` that still sets it (`pydantic-settings` refuses an unknown key in a dotenv file), so it is a dated shim, `SHIM-SEC-010`, with the contract step its own change. `JWT_SECRET`: values that started before and now refuse — the `.env.example` placeholder and any value published in this repository, a public key in PEM, SSH, JWK or base64-DER form, a value that is one short unit repeated, and a value whose estimated entropy is under 80 bits. README documents both. **Tokens: unchanged on the wire** — HS256 compact JWS with the same claims; a token issued by the previous image verifies under this one and the reverse (rollback keeps sessions). **REST/OpenAPI, MCP tools, DB schema, SPA: unchanged**; `ops/surfaces/*` byte-identical. |
| **Known dependents** | From `./run impact` (index `current`, revision `3e3faab33828`, 1884 nodes / 3158 edges): `auth.py` → `dependencies.py`, `main.py`, `models.py`, `routers/auth.py`, `services/password_reset.py`, transitively every router and `task_service.py`; governed by ADR 0044. `config.py` → twelve modules directly. `startup_checks.py` → `main.py` only; protected by `test_security_wave.py` and every TestClient suite through `main.py`. `requirements.txt`, `requirements.lock`, `Dockerfile` → unit `ops`, no import-derived test protection (`BLIND-TEST-001`); `BLIND-OPS-001` for the image. |
| **Uncertain / dynamic areas** | **The production secret.** This repository cannot see the deploy host's `JWT_SECRET`. A value that passed the old check (≥ 32 characters, not one of five defaults) and fails a new one refuses to start after the deploy. Mitigation: the new refusals only reject values that are publicly known or degenerate (each is a forgeable key, the same reasoning as SEC-1), and `python -m app.startup_checks` runs the new checks against the host `.env` with the new image *before* the deploy (`docs/operations.md`). **The entropy estimate** is an estimate: it refuses repetition and tiny alphabets, it cannot tell a memorable phrase from a random string — that limit is written into the decision record and `docs/threat-model.md`. **`mcp` uses PyJWT too** (its OAuth helpers, unused here): the PyJWT bump moves a transitive of `mcp`; `test_mcp_session.py` and the two MCP suites must stay green. |
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

The M7.1 decision record gives the reasoning; in short:

- **Migrate to PyJWT 2.15.1.** python-jose's last release is 3.5.0 (2025-05-28); no fixed release for
  either CVE exists, and "3.5.1" is not a real version. PyJWT is maintained, already in the image (a
  dependency of `mcp`, at 2.13.0), and covers this application's use exactly (HS256 encode/decode, required
  claims). 2.13.0 itself carries advisories fixed in 2.14.0/2.15.0 (OSV, 2026-11-25), so the pin is 2.15.1
  (2026-09-28, older than two weeks, no OSV advisory). Dropping python-jose removes `ecdsa` (CVE-2024-23342,
  unfixed), `rsa` and `pyasn1` from the image.
- **`HS256` is a constant in `auth.py`**; encode and decode use it, never `settings.jwt_algorithm`.
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

## Test evidence

*(filled in after the work)*

## Results

*(filled in after the work)*
