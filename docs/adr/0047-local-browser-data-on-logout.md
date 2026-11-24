# ADR 0047 — Local browser data on logout (Lokale Browserdaten beim Logout)

- **Date:** 2026-11-24
- **Status:** Accepted
- **Scope:** `frontend/src/shared/browserStorage.js` (new), every former `localStorage` caller in
  `frontend/src/`, `backend/app/models.py` and `backend/app/routers/auth.py` (`account_id`),
  `tools/surfaces.py` (S8 capture of `RULE-SURF-001`), `ops/surfaces/{openapi,spa}.json`,
  `rules/ledger.yaml` (`RULE-SURF-001`, `RISK-SEC-001`, `RISK-FE-001`, `RISK-TEST-004`),
  `rules/shims.yaml` (`SHIM-FE-001`), `tools/fixtures/negative.sh`
- **Brief:** [0075](../briefs/0075-local-browser-data-on-logout.md)
- **Findings:** `REV-006` (Codex review of the security run `20261118T131510Z-claude`),
  `RISK-SEC-001`; package M6 of the November 2026 security remediation plan, decision gate D6.

## Context

A browser profile is shared more often than an account is: a family laptop, a workstation, a
phone handed over. Before this decision the SPA kept ten keys in `localStorage`, written from a
dozen files. `logout()` removed five of them — `token`, `username`, `role`, `fullName`, `email` —
and left the offline queue (`outbox`, which holds the full text of every unsent capture and
change) and the capture draft (`captureDraft`) in the profile. Both were tagged with the username,
and the code that read them showed only the signed-in user's entries; that is a display filter, not
a confidentiality boundary (`REV-006`). Anyone with the profile, or any script on the origin, read
them.

Two more defects sat in the same place. The role was read from `localStorage['role']`, so writing
`admin` there rendered the admin UI (`RISK-SEC-001`; the server answered 403). And the username is
not a stable identity: deleting an account frees its name, and a later account with the same name
would have been shown the old account's unsent queue.

## Decision 1 — one storage module, one inventory

`frontend/src/shared/browserStorage.js` declares every key with its data class — credential,
identity, outbox, draft, preference, legacy — and is the only file in `frontend/src` that touches
`localStorage`. `frontend/tests/browserStorage.test.js` holds that by a source scan, as
`threeIsolation.test.js` holds the three.js chunk. Every access is guarded: a refused read is
`undefined`, a refused write `false`, never an exception.

Only **UI preferences** (`theme`, `ui`, `inboxMode`) are shared between accounts. Everything else is
account-bound.

## Decision 2 — namespace by a stable account id, not the username

`GET /auth/me` returns `account_id`: `users.id` as an opaque string. The column is
`INTEGER PRIMARY KEY AUTOINCREMENT`, which SQLite never hands out twice, and it survives a restore.
The queue lives under `outbox:<account_id>`, the draft under `captureDraft:<account_id>`. The S8
snapshot records them as `outbox:{account}` and `captureDraft:{account}`.

A login drops the previous `accountId` before it stores the new token, and binds the new id only
when `/auth/me` answers. Until then nothing is persisted: the outbox queues in memory, as it already
does when storage refuses writes (brief 0062), and what it queued joins the account's stored queue
once the id is bound. When the binding goes away (a logout), the memory copy goes with it and is
never sent.

*Rejected:* the username as namespace (the re-registration alias above); a hash of the username
(the same alias, hidden); M1's `storage_id` (not on `main` when this was decided, and an internal
storage identifier should not double as a client-visible one).

## Decision 3 — explicit logout purges; with an unsent queue it asks first (D6)

`auth.logout()` counts the unsent ops (the account's queue plus anything left in the legacy one). If
there are any, `window.confirm` asks: *Abbrechen* changes nothing and stays signed in; *OK* is
"abmelden und lokale Änderungen verwerfen". Then it removes the account's queue and draft,
`accountId`, `token`, `username` and every legacy key, and leaves with a full page load, so the
in-memory task snapshot (the Pinia stores) goes with the page. Another tab that sees its token
disappear reloads to the login as well. Both UIs use the same `logout()`.

`window.confirm` rather than a designed dialog: it is the one confirmation the app already uses
(`plan.leaveQ`), it blocks the `pagehide` flush until answered, and it renders nothing a node test
would have to mount.

## Decision 4 — a 401 or being offline locks, it does not wipe

The API client's 401 handler removes only the token (`lockSession`). The account's namespace stays,
shown to nobody; the same account signing in again sees it and its paused ops go out, another
account sees its own namespace only. Wiping on a 401 would silently destroy work the user never
chose to discard — an expired token is not a decision. What this leaves in the profile is recorded
as `RISK-FE-001`.

## Decision 5 — the role comes from the server on every mount

`auth.role` starts as `user` in memory and is set from `/auth/me` each time the store is created,
i.e. on every page load. Nothing reads `localStorage['role']`; name and e-mail are memory only too.
The REST guards stay the security boundary. `RISK-SEC-001` is resolved on its own closing criterion.

## Decision 6 — the S8 capture reads the inventory (a change to `RULE-SURF-001`'s check)

`tools/surfaces.py` snapshotted storage keys by scanning for literal `localStorage.getItem('…')`
calls. With every call behind one module and per-account keys built at run time, that scan would
have found no key at all — and passed. The capture now also reads every `declareKey` literal, and a
new negative fixture (`SURF-001-storage`) declares a key without updating the snapshot and requires
the gate to go red. Check, ledger statement, fixture and docs (`docs/task-interface.md`) change in
the same commit.

## Migration

**Expand → migrate → switch** happen in this change; **contract** is deferred.

- Expand: `account_id` on `/auth/me` (additive; the MCP tool `me_auth_me_get` returns it too).
- Migrate: on the first `/auth/me` after the deploy, the signed-in user's ops in the legacy `outbox`
  move into `outbox:<id>` (the legacy copy is removed only after the write succeeded), their legacy
  draft into `captureDraft:<id>`; `role`, `fullName`, `email` are removed. Other users' legacy
  entries stay until the next explicit logout removes every legacy key — the one-time cleanup. Such
  entries were unsent and could not be sent by anyone but their author; the logout question counts
  them, so discarding them is not silent.
- Switch: the new code reads and writes only the namespaced keys.
- Contract (`SHIM-FE-001`, expires 2027-03-01): delete the legacy declarations and the migration and
  cleanup code; `ops/surfaces/spa.json` then loses the five legacy keys.

**Rollback.** The previous image reads the legacy keys only. Ops already migrated are invisible to it
— stranded, not lost: rolling forward sends them. A rollback while users have unsent offline work
should be avoided or announced.

## Evidence

Red before the control, observed on 2026-11-24 against `5d85f6e`:

- `frontend/tests/authStore.test.js` — 8 of 12 failed: the store's role was `admin` from storage;
  `logout()` neither asked nor returned; after logout the profile still held `outbox` with the
  text "Kündigung Arbeitsvertrag" and `captureDraft`; a new account under the same username was
  shown the old account's queue; nothing migrated or removed the legacy keys.
- `frontend/tests/browserStorage.test.js` — failed: no storage module existed. At `5d85f6e`, twelve
  files in `frontend/src` called `localStorage` directly.
- `backend/tests/unit/test_auth.py::TestAccountId` — 4 of 4 failed: `/auth/me` had no `account_id`.

Green after: all three, plus `useOutbox.test.js` (now on the namespaced key, with five namespace
cases), and `make check`.

**Not covered.** No test renders the confirm dialog, clicks *Abmelden*, or observes `pagehide` and
the cross-tab reload in a real browser: there is no browser runner here (`RISK-TEST-004`, which now
names this gap). The logout itself is tested in node with the real auth store, outbox and draft
over a synthetic profile. Server-side token revocation on logout is not part of this decision; a
copied JWT stays valid until it expires (M2, `auth_version`).
