# ADR 0050 — Local browser data on logout (Lokale Browserdaten beim Logout)

- **Date:** 2026-11-24
- **Status:** Accepted
- **Scope:** `frontend/src/shared/browserStorage.js` (new), every former `localStorage` caller in
  `frontend/src/`, `backend/app/models.py` and `backend/app/routers/auth.py` (`account_id` on
  `/auth/me` and `/auth/login`, `created_at` on `/auth/me`),
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

A login drops the previous `accountId` and binds the id the login response names (`POST /auth/login`
returns `account_id`, review round 2), so a failed `/auth/me` after a login leaves no unbound window.
The one session with a token and no id is the previous deploy's, on its first load before `/auth/me`
answers: its outbox keeps writing the legacy `outbox` key exactly as that deploy did, so a reload
loses nothing, and the bind migrates it. Signed out the outbox queues in memory, as it does when
storage refuses writes (brief 0062); this user's ops queued that way join the account's stored queue
once an id is bound. When the binding goes away (a logout), the memory copy goes with it and is never
sent. `readKey`/`writeKey`/`removeKey` refuse a name the inventory does not declare, so no module can
keep data a logout would not know of.

*Rejected:* the username as namespace (the re-registration alias above); a hash of the username
(the same alias, hidden); M1's `storage_id` (not on `main` when this was decided, and an internal
storage identifier should not double as a client-visible one).

## Decision 3 — explicit logout purges; with an unsent queue it asks first (D6)

`auth.logout()` counts the unsent ops (the account's queue, anything left in the legacy one, and the
ops only the page holds, which the outbox reports through `reportPending`; each op once). If
there are any, `window.confirm` asks: *Abbrechen* changes nothing and stays signed in; *OK* is
"abmelden und lokale Änderungen verwerfen". Then it removes the account's queue and draft,
`accountId`, `token`, `username` and every legacy key, and leaves with a full page load, so the
in-memory task snapshot (the Pinia stores) goes with the page. A full page load alone does not
guarantee that: the browser may keep the left page in its back/forward cache and restore it,
snapshot and rendered tasks included, on *Back* without running any of its code. So the auth store
listens for `pageshow` and, on a restore (`persisted`) of a page whose session was logged out or
replaced, loads afresh (to the login when no token is left). Another tab that sees its token
disappear goes to the login as well; one that sees the token replaced by another sign-in, or the
account id change, reloads, rather than rebinding its outbox to the other account. The listener is
registered in every tab, signed in at load or not. Both UIs use the same `logout()`.

An `/auth/me` answer binds only the session it was asked for. `fetchMe` notes the token it sends;
an answer that lands after the profile's token changed (another tab signed in, a logout, a 401) sets
no role and binds nothing. `bindAccount` refuses, besides, to replace an account id already bound
with another: a login binds the id its response names and a token never changes account. Without
both, a slow page load's answer for an earlier account could rebind a newer account's session to the
earlier account's namespace, and its queue would be shown and sent under the newer token.

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
- Migrate: on the first `/auth/me` after the deploy, this account's ops in the legacy `outbox`
  move into `outbox:<id>` (the legacy copy is removed only after the write succeeded), its legacy
  draft into `captureDraft:<id>`; `role`, `fullName`, `email` are removed. *Which* legacy entries are
  this account's (review round 2): the username alone does not say, since a deleted account's name
  can be registered again. Entries a still-running pre-deploy session wrote are that session's and
  move. A fresh login (`startSession`) instead drops the legacy draft — it carries no time to prove
  anything by — and marks the legacy ops `prior`; the bind adopts a `prior` op only when its `at`
  is not older than the account's `created_at` (from `/auth/me`) and removes it when it is, since it
  then provably belongs to an earlier account of that name. Without a `created_at` a `prior` op
  stays, unread. The line is drawn with the browser's clock against the server's; a skewed client
  clock moves it by the skew — a residual of the shim's life, recorded under `SHIM-FE-001`. Other users' legacy
  entries stay until the next explicit logout removes every legacy key — the one-time cleanup. Such
  entries were unsent and could not be sent by anyone but their author; the logout question counts
  them, so discarding them is not silent.
- Switch: the new code reads and writes only the namespaced keys.
- Contract (`SHIM-FE-001`, expires 2027-03-01): delete the migration, the `prior` marking and the
  legacy queue fallback, but keep the sweep: from `LEGACY_SWEEP_FROM` (2027-03-01) every bind already
  removes the five legacy keys, whoever left them, so a profile that was never explicitly logged out
  is still cleaned once anyone signs in. The five names stay declared as swept keys.

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

Review round 2 (same day): ten red tests across `authStore.test.js` (7), `browserStorage.test.js`
(1) and `test_auth.py::TestAccountId` (2) failed against `1fef64c` and pass after the fix — the
re-login whose `/auth/me` fails, the offline first load, the memory-only queue at logout, the
deleted-account migration, undeclared keys, the dated sweep, the two cross-tab cases, the login's and
`/me`'s new fields. Brief 0075 §Review round 2 lists them.

**Not covered.** No test renders the confirm dialog, clicks *Abmelden*, or observes `pagehide` and
the cross-tab reload in a real browser: there is no browser runner here (`RISK-TEST-004`, which now
names this gap). The logout itself is tested in node with the real auth store, outbox and draft
over a synthetic profile. Server-side token revocation on logout is not part of this decision; a
copied JWT stays valid until it expires (M2, `auth_version`).
