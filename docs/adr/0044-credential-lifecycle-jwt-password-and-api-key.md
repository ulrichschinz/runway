# ADR 0044 — Credential lifecycle: JWT, password and API key

- **Date:** 2026-11-24
- **Status:** Accepted
- **Scope:** `backend/app/auth.py` (the token's claims), `backend/app/dependencies.py`
  (`get_current_user`), `backend/app/database.py` (column `users.auth_version`, trigger
  `users_auth_version_monotone`, the `site_settings` row `auth_version_expand_at`,
  `get_auth_version`, `change_password`), `backend/app/routers/auth.py` (login, password change),
  the settings pages of both UIs, `SHIM-SEC-008`; amended for Decision 5 by `backend/app/auth.py`
  (password policy, Argon2id, legacy bcrypt), `backend/app/models.py`, `backend/app/middleware.py`
  (body limit), `frontend/nginx.conf`, `SHIM-SEC-009`; amended for Decision 6 by the `api_keys`
  table and its functions in `backend/app/database.py`, the key format beside it,
  `backend/app/dependencies.py`, the `/auth/apikey*` routes, `API_KEY_LEGACY_CUTOFF`, the new UI's
  settings page, `tools/checks/secret_scan.py`, `WAIVER-SEC-003`
- **Brief:** [0066](../briefs/0066-a-password-change-ends-every-session.md); Decision 5:
  [0067](../briefs/0067-passwords-are-hashed-with-argon2id.md) (amended 2026-11-24); Decision 6:
  [0070](../briefs/0070-api-keys-are-stored-as-hashes.md) (amended 2026-11-25)

This record was written for milestone M2.1 of the security remediation plan (finding **REV-001**)
and amended for M2.2 (finding **SEC-006**, Decision 5) and for M4 (the API-key lifecycle,
`WAIVER-SEC-003`, Decision 6).

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

## Decision 5 — the password hash: Argon2id, bounded in bytes, migrated on login (M2.2)

*Added 2026-11-24, brief 0067.* Passwords were hashed with bcrypt through passlib, which reads only
the first 72 UTF-8 bytes: two passwords sharing a 72-byte prefix were the same password (SEC-006).
No password field and no request body had a limit, an unknown account cost no hash work (so the
response time said whether it existed), and a NUL byte made passlib raise — a 500.

Decision gate D2 of the plan: **Argon2id with measured server parameters and rehash-on-login.**

1. **Policy in UTF-8 bytes.** A password being set is 8 to 1024 bytes with no NUL character; a
   password being given (login, the current password of a change) has no minimum, so a password set
   before the rule still logs in, and at most 4096 bytes — the bound the previous image enforced
   (passlib's `MAX_PASSWORD_SIZE`), so no account that logged in before is refused by parsing
   (brief 0067, R7). Pydantic refuses outside the rule with 422 while parsing, before any hash or
   query; the OpenAPI document declares `maxLength` 1024 / 4096 (true bounds in characters) and the
   byte rule in the description.
2. **Body limit** in the backend, outside every route: 16 KiB on `/auth/*`, 1 MiB elsewhere (nginx's
   default, so nothing the SPA path could send is refused), 413 before a declared oversized body is
   read and as soon as a chunked one passes the limit; nginx gets the 16 KiB on `/api/auth/` too.
3. **Argon2id** via argon2-cffi used directly; passlib is removed. Parameters: t=3, m=64 MiB, p=1,
   measured on 2026-11-24 at 75 ms per verification on the development host against a budget of
   250 ms and 64 MiB per verification and **500 ms per login** (the Argon2id verification plus the
   cost-12 bcrypt check every login does until the contract) on the deploy host. Logins verify on the event loop one at a time, so the
   memory budget is also the peak. The deploy host was not measured; `python -m app.auth` measures
   both figures there, before Switch 1. Parameters change only before Switch 1: after it, hashes at
   old parameters make a not-yet-rehashed account distinguishable by timing. Tests run reduced parameters, marked test-only in `conftest.py`; one test
   runs the production ones.
4. **Legacy bcrypt** is verified by the bcrypt package directly, with the 72-byte truncation explicit,
   against vectors passlib itself produced. An **exact** match — input of 71 bytes or fewer without a
   NUL, so bcrypt saw every byte — is rehashed to Argon2id by a compare-and-swap on the verified hash,
   without touching `auth_version` (same password, no session ends). A match for **72 bytes or more is
   ambiguous**: the hash cannot tell the real password from its prefix plus anything, so the typed
   value never becomes the new hash — not by the login, and not by the password change: while the
   current password is accepted only as this ambiguous case, a new password sharing its first 72
   bytes (the same value retyped, or the prefix plus another suffix) is refused with 422 before any
   hash (brief 0067, R6). During a window the login succeeds and the `Token` says
   `password_change_required: true`; both UIs send the person to set a new password; after the window
   it is refused and the operator reset (`python -m app.services.password_reset <account>`,
   `docs/operations.md`) is the recovery path.
5. **No existence or scheme oracle.** Every login runs one Argon2id verification and one bcrypt check
   at cost 12, against a dummy where the account has no hash of that kind; every failure is the same
   401. Equal work, not a constant-time proof: the success path (rehash) differs, and only for
   someone who knows the password.

**Expand → switch → contract, by date from the first boot** (`site_settings.password_kdf_expand_at`,
written once; missing fails closed to Argon2id and no ambiguous login):

- *Expand (first boot):* both schemes verified; policy, limits and uniform work at once; **new hashes
  still bcrypt for 7 days**, so the previous image can verify every hash if this one is rolled back;
  in that week a new password must be **shorter than 72 bytes** (422 otherwise), so bcrypt stores it
  whole and the 72-byte alias is never created new (brief 0067, review fix R2).
- *Switch 1 (+7 days):* new hashes Argon2id; rehash-on-login.
- *Switch 2 (+67 days):* the ambiguous case refused.
- *Contract (deferred, its own change):* remove bcrypt, the dummy, the row and the dependency once no
  bcrypt hash remains (the rest reset by the operator). `SHIM-SEC-009`, expiring 2027-04-30.

Rejected: **pre-hashing** (SHA-256 then bcrypt) — still bcrypt, and every stored hash would need the
password to convert anyway; **rehashing the ambiguous input** — makes a guessed prefix plus junk the
authoritative password and locks the owner out; **writing Argon2id from the first minute** — a
rollback in the first days would then fail every changed or rehashed account; **environment knobs for
the parameters or the dates** — the knob that gets turned, as Decision 3 says.

Consequences: after Switch 1 the previous image cannot verify Argon2id hashes (passlib raises: 500 at
login for those accounts), so the rollback target from then on is this image or later. Every login
costs one Argon2id verification plus one cost-12 bcrypt check (about 250 ms on the development host)
until the contract removes bcrypt. A lone surrogate in any JSON string field makes FastAPI's own 422
renderer fail with 500 — pre-existing and not specific to passwords; recorded in brief 0067.

## Decision 6 — API keys: a hash, a public id, shown once, ended by date (M4)

*Added 2026-11-25, brief 0070.* An API key was `secrets.token_urlsafe(32)`, stored in `users.api_key` as
the cleartext value that authenticates, permanent, and returned by `GET /auth/apikey` on demand: a copy
of `users.db` or of any backup of it was a working credential for every account (`WAIVER-SEC-003`,
Phase 0 SEC-5). Decision gate D4 of the plan: **a 256-bit secret, stored as a SHA-256 hash, behind a
public random key id, with expiry and revocation.**

1. **Format** `rwk_<key id>_<secret>`: a recognisable prefix (for secret scanning and redaction), a
   public id of 16 hex characters (64 random bits), a secret of 43 URL-safe characters (256 random
   bits), defined in `backend/app/database.py` beside the table. Stored: the SHA-256 of the whole string. No salt and no pepper — 256 bits make an offline
   search pointless, and a pepper would be a new root secret on the same host as the database.
2. **Table** `api_keys` (a new table, created identically on fresh and migrated databases, so
   `RISK-SURF-001` cannot recur in it): id, `user_id`, `kind` (`issued` | `legacy`), the hash, a label,
   created/expires/revoked/last-used times. Triggers keep a revoked key revoked and a key's identity
   immutable. Expiry 1–365 days (default 365); at most 10 active issued keys per account; the inactive
   history is bounded.
3. **Shown once.** `POST /auth/apikeys` returns the key in its `201` and nowhere else; `GET /auth/apikeys`
   returns metadata only; `DELETE /auth/apikeys/{key_id}` revokes. Creating, revoking and the deprecated
   `regenerate` need a signed-in session: an API key gets `403`, so a stolen key cannot mint a successor
   that would survive its own revocation or expiry, and a legacy key from a backup cannot be swapped for
   one that outlives the cutoff (corrected in review: `regenerate` first kept accepting a key, on the
   argument that it replaces rather than multiplies — which missed both). Listing accepts any credential.
4. **Authentication by hash only, one answer.** An issued key is looked up by its id and its hash
   compared in constant time; a legacy key by its hash. `users.api_key` is never compared. Unknown,
   malformed, expired, revoked and post-cutoff legacy keys get the same 401 per credential shape.
   `last_used_at` is written at most once a minute. A password change still revokes no key (Decision 2);
   recovery revokes keys separately, and the settings pages say so.
5. **The legacy keys and the cutoff.** Every boot hashes each cleartext `users.api_key` into a `legacy` row
   (idempotent; an old-image rotation during a rollback supersedes the earlier row). Legacy keys are refused
   from `API_KEY_LEGACY_CUTOFF` — default **2027-01-15**, which is also the latest date the setting may name:
   it can bring the cutoff forward, never push it back, because every old backup holds these keys. The
   refusal is by date and needs no deploy; **the first boot at or after the cutoff revokes every legacy row
   and empties `users.api_key` in every row**, which also empties a pre-migration backup restored later
   before it serves a request. Revoking the legacy key, or the deprecated `regenerate` (which ends every key
   of the account and mints one), empties that account's column at once and **closes** it
   (`users.api_key_closed_at`); registration writes no cleartext and closes the new account from the start;
   `init_db` no longer back-fills one. A closed account's column is never imported again — the boot empties
   it instead — because the previous image's boot back-fills a cleartext key into every NULL row, so a
   rollback would otherwise hand every moved and every new account a working key (corrected in review).
   Every pre-cutoff boot also lowers the `expires_at` of live legacy rows to the cutoff in force, so an
   earlier `API_KEY_LEGACY_CUTOFF` is the expiry the metadata announces.
6. **The old routes** keep path, method and schema, are `deprecated` in OpenAPI and answer with
   `Deprecation`, `Sunset` (the cutoff) and `Link: rel="successor-version"`. `GET /auth/apikey` returns a
   live legacy value until the cutoff, `""` otherwise — and only to a signed-in session or to the legacy
   key itself; any other API key gets `""`, because the legacy key is a second credential independent of
   the one asking, and a stolen `rwk_` key that could read it back would survive its own revocation
   (corrected in review round 2). `auth.apikey.disclosed` is written only when a value leaves.

**Expand → migrate → switch → contract:**

- *Expand and migrate (this change):* everything above. The previous image still reads `users.api_key`, so a
  rollback inside the window keeps legacy keys working; keys minted by this image do not work under it, and
  the keys the previous image back-fills for closed accounts stop at the roll-forward.
- *Switch (by date, 2027-01-15):* legacy keys refused, the GET silent; the first boot after it ends and wipes
  them. Not rolled back: rolling back past this image after the cutoff would let the previous image mint
  cleartext keys into the emptied column (`docs/operations.md`, *API keys*).
- *Contract (deferred, its own change, after 2027-01-15 and before 2027-01-31):* drop `users.api_key` by a
  versioned table rebuild rather than another ad-hoc `ALTER` (SQLite cannot drop a UNIQUE column in place),
  remove the legacy lookup, answer `410` on the two old routes, add the gate rule that fails on a
  cleartext-shaped key in a DB dump or an API response, and only then remove `WAIVER-SEC-003`. Trigger
  besides the date: the first-party clients that still read `GET /auth/apikey` — the old web UI (`?ui=alt`)
  and the Android app's password login (`docs/design/2026-10-31-unified-ui/shared/inventory.md` §3.8) —
  create their key with `POST /auth/apikeys` instead.

Rejected: **bcrypt or Argon2id over the key** (the waiver's first sketch) — a deliberately slow hash on every
authenticated agent request buys nothing against a 256-bit secret; **a server pepper / HMAC key** — a new
root secret beside the database; **encrypting the column** — moves the secret, still discloses on GET;
**deleting `GET /auth/apikey` now** — breaks callers before the show-once replacement exists for them;
**hashing the legacy values and nulling the column at once** — the rollback target would mint new
cleartext keys for every account at its boot, breaking every agent; **an environment knob that can extend
the cutoff** — the knob that gets turned.

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
- Restoring `users.db` from a backup restores the versions *and the password hashes* in it, so
  every revocation made after the backup is undone: a token a later change had ended carries the
  restored version again and is accepted until it expires. The monotone trigger cannot stop that —
  a restore replaces the file and runs no `UPDATE`. **After every restore, bump every account's
  version once** (Decision 4), exactly as after a rollback. (Corrected in review: an earlier draft
  called a restore fail-closed.)
- A leaked `JWT_SECRET` still lets an attacker mint a token at any version. That is not this
  decision's threat; rotating the secret (and `startup_checks`) remains the answer.
- The web UI's own session survives its password change only because it stores the token from
  the response. A third-party client that changes the password and keeps using its old token gets
  401 — the intended behaviour change, documented in the README.
