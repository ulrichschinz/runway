# ADR 0044 — Credential lifecycle: JWT, password and API key

- **Date:** 2026-11-24
- **Status:** Accepted
- **Scope:** `backend/app/auth.py` (the token's claims), `backend/app/dependencies.py`
  (`get_current_user`), `backend/app/database.py` (column `users.auth_version`, trigger
  `users_auth_version_monotone`, the `site_settings` row `auth_version_expand_at`,
  `get_auth_version`, `change_password`), `backend/app/routers/auth.py` (login, password change),
  the settings pages of both UIs, `SHIM-SEC-008`
- **Brief:** [0066](../briefs/0066-a-password-change-ends-every-session.md)

This record is written for milestone M2.1 of the security remediation plan (finding **REV-001**).
The password hash (M2.2, SEC-006) and the API-key lifecycle (M4, `WAIVER-SEC-003`) are later
decisions of the same lifecycle and will be added here as their own sections when they are made;
nothing below decides them.

## Context

A JWT carried `sub` and `exp` and nothing else. `get_current_user` checked the signature and that
the named account still existed. So a token was valid until it expired — 24 hours by default —
whatever happened to the account meanwhile. In particular, **a password change ended no session**:
someone who had obtained a user's token (a shared browser, a copied `localStorage`, a log or a
proxy that kept a header) kept full access after the user had changed the password to lock them
out, on every REST route and every MCP tool. The characterization test
`test_existing_tokens_survive_a_password_change` pinned exactly that as a defect. The review of
2026-11-24 recorded it as REV-001: account recovery after a compromise did not recover the account.

Three ways to revoke tokens were on the table (remediation plan, decision gate D3):

1. **Rotate `JWT_SECRET`.** Ends every session of every user, needs a restart and an operator, and
   cannot be done by the user who is being attacked. Rejected as the mechanism; it stays the
   break-glass for a leaked secret.
2. **A token blacklist** (`jti` → revoked). Grows with every logout, needs expiry housekeeping, and
   a password change would have to enumerate tokens nobody stored. Rejected.
3. **A monotone per-account version** in the database and in every token. One integer per account,
   no growth, and "end every session of this account" is one `UPDATE`.

## Decision 1 — `users.auth_version`, in every token

`users.auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version >= 1)` is added by the additive
migration loop. A trigger, `users_auth_version_monotone`, refuses any update that would lower it, so
a revoked token can never become valid again by a version going backwards (a hand edit, a buggy
migration, a restore of one row).

Every token the server issues carries `sub`, `iat`, `exp`, a random `jti` and `auth_version`. The
`jti` is not stored anywhere; it makes two tokens issued in the same second distinguishable in a
log or an incident, nothing more. Decoding requires `sub` and `exp`; a token whose `auth_version` is
present but not a positive integer is invalid.

`get_current_user` loads the account's version with the account and accepts the token only when
the version it carries equals the stored one. Every refusal — bad signature, expired, unknown
account, stale version, malformed claim — is the same **401 `Not authenticated`**, so a caller
cannot tell a revoked token from a forged one. REST and MCP both pass through this function
(fastapi-mcp forwards the `Authorization` header to the route), so both are held by it.

## Decision 2 — the password and the version change in one statement

`PUT /auth/password` verifies the current password, then runs one `UPDATE … SET hashed_password=?,
auth_version=auth_version+1 WHERE username=? AND hashed_password=<the hash that was verified>
RETURNING auth_version`. One statement is one transaction in SQLite: there is no state in which the
hash changed and the version did not, or the reverse. The `hashed_password` condition makes it a
compare-and-swap: of two concurrent changes that both verified the old password, exactly one
writes; the other finds no row and answers **400 `Current password is incorrect`** — which is by
then true, and the status the route already used.

The response carries a fresh token at the new version, so the session that made the change
continues and every other session — other browsers, other devices, a thief — gets 401 on its next
request. The response body was untyped (`{}` in OpenAPI) and stays so; it gains `access_token` and
`token_type` beside `detail`. The OpenAPI document and the MCP tool list do not change (the route
is REST-only, ADR 0037).

**API keys are not revoked by a password change.** They are a separate credential with their own
rotation (`POST /auth/apikey/regenerate`) and their own migration (M4, `WAIVER-SEC-003`); revoking
them silently would break every agent and MCP client the user runs, which is not what "change my
password" asks for. Both settings pages say, after the change, that other sessions have ended and
that the API key still works and can be regenerated below if it may be compromised — the recovery
flow offers the key rotation explicitly instead of performing it.

## Decision 3 — expand → switch → contract, by date, not by switch

Merging deploys, and at that moment every logged-in user holds a token without `auth_version`,
issued by the previous image. Refusing them would log everyone out on the deploy; accepting them
for ever would keep a second, weaker token form alive.

- **Expand (this change).** On its first boot the new image writes `auth_version_expand_at` (UTC
  epoch seconds) into `site_settings`, once (`INSERT OR IGNORE`). A token **without**
  `auth_version` is accepted only if its `exp` is no later than that moment plus
  `JWT_EXPIRE_HOURS` — that is, only if it can have been issued before this image started — and it
  is then compared as version **1**. So a versionless token is revoked by the first password
  change after the deploy exactly like a new one, and the window can only shrink. A token with a
  version different from the stored one is refused from the first request: there is no expand
  phase for the check itself.
- **Switch (automatic, by date).** One JWT lifetime after the first boot, no versionless token can
  satisfy the condition any more; the legacy branch is then dead without a deploy or a setting.
  A missing `auth_version_expand_at` row fails closed (versionless refused).
- **Contract (deferred, its own change).** Remove the legacy branch and the `site_settings` row.
  Not before the window has passed in production; tracked as `SHIM-SEC-008`, expiring 2027-01-31.

No environment variable is added: the window is one documented JWT lifetime, which the plan asks
for, and a knob to lengthen it would be the knob that gets turned.

## Decision 4 — revocation without a password change

For an incident the operator ends an account's sessions with one statement on the host —
`UPDATE users SET auth_version = auth_version + 1 WHERE username = ?` — and every session of every
account with the same statement without the `WHERE`. Both are in `docs/operations.md`. This is the
"global event" of the plan: no secret rotation, no restart, API keys untouched.

## Consequences

- Each authenticated JWT request reads one integer more from the row it already read. No extra
  query on the JWT path; a versionless token costs one `site_settings` read during the window.
- **Rollback.** The previous image ignores the column and the row and accepts every
  correctly-signed token, so rolling back re-opens REV-001 for its duration but breaks nothing; a
  password changed under the previous image does not bump the version. **After rolling forward
  again, bump every account's version once** (Decision 4) — that ends every session, which is the
  price of closing what the rollback window left open. Tokens the previous image minted during the
  rollback are versionless and newer than the expand moment, so they are refused anyway and those
  users log in again.
- Restoring `users.db` from a backup restores the versions in it; tokens issued after the backup
  carry higher versions and are refused. That is fail-closed and needs nothing.
- A leaked `JWT_SECRET` still lets an attacker mint a token at any version. That is not this
  decision's threat; rotating the secret (and `startup_checks`) remains the answer.
- The web UI's own session survives its password change only because it stores the token from
  the response. A third-party client that changes the password and keeps using its old token gets
  401 — the intended behaviour change, documented in the README.
