# Change Impact Brief 0075 — Local browser data on logout

| Field | Value |
|---|---|
| **Requested outcome** | Security remediation package M6 (`REV-006` and `RISK-SEC-001`) of the November 2026 security plan, ordered by Uli on **2026-11-24** ("please fully implement security-fixes for all"). After an explicit logout, a synthetic browser profile holds no task content, draft, outbox entry, token or role of that account; a second account never sees the first account's namespace; a role written into `localStorage` never shows the admin UI after `/auth/me` has answered. |
| **Owning unit** | `fe/shared` — `frontend/src/shared/browserStorage.js` (new: the key inventory, every storage access, namespacing, purge, legacy cleanup), `frontend/src/composables/useOutbox.js`, `useTheme.js`, `useDarkMode.js`, `frontend/src/shared/uiFlag.js`, `inboxMode.js`, `frontend/src/api/client.js`, `keepalive.js`. `fe/identity` — `frontend/src/stores/auth.js`, `frontend/src/identity/useAccount.js`, `frontend/src/views/SettingsView.vue`. `fe/tasks` — `frontend/src/tasks/captureDraft.js`, `frontend/src/tasks/components/CaptureLine.vue`. `fe/app` — `frontend/src/router/index.js`, `frontend/src/router/NewUiHost.vue`. `fe/layout` — `frontend/src/components/AppShell.vue`. `be/leaves` — `backend/app/models.py`. `be/routers` — `backend/app/routers/auth.py`. `ops` — `tools/surfaces.py`, `ops/surfaces/`. `docs` — this brief, ADR 0050. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §2, §3 (pure frontend rules in `frontend/src/shared/`), §5 (REST, MCP tool `me_auth_me_get`, localStorage keys are public surfaces), §9 (the S8 capture is the check behind `RULE-SURF-001`); [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (tests cover logic, not components; features never import features); [`backend/AGENTS.md`](../../backend/AGENTS.md). |
| **Governed by** | ADR 0042 (the `ui` key, kept as a cross-account preference); ADR 0007 (frontend test scope); new **ADR 0050** (local browser data on logout). |
| **Rule IDs touched** | `RULE-SURF-001` — its S8 capture now also reads the key declarations in `frontend/src/shared/browserStorage.js` (otherwise the namespaced keys would be invisible to the snapshot). Check, ledger statement, negative fixture and docs change in the same commit (META-RULE). No rule added or removed. |
| **Risks touched** | `RISK-SEC-001` — resolved when its closing criterion holds (role from a server response on every mount, never from storage). `RISK-TEST-004` — names the logout-confirm path as the remaining unrendered gap. New `RISK-FE-001` — a session that ends without an explicit logout (401, expiry, closed browser) leaves that account's namespace in the profile, locked rather than wiped (decision D6). New `SHIM-FE-001` — the legacy-key migration and cleanup code, with a removal date. |
| **Entry points** | Every `localStorage` read/write in `frontend/src` (inventory below); `auth.login`, `auth.fetchMe`, `auth.logout`; the axios 401 interceptor; the outbox load/save/flush; the capture draft; `GET /auth/me`. |
| **Affected public surfaces** | **S1 REST / S2 MCP:** `GET /auth/me` (and therefore the MCP tool `me_auth_me_get`) gains an optional `account_id` string, and (review round 2) an optional `created_at` (UTC ISO 8601, the account's creation time, the legacy migration's proof); `POST /auth/login`'s `Token` gains `account_id` too, and `POST /auth/register`'s `UserInfo` returns `account_id` (from the inserted row) with `created_at` `null`. All additive: old clients ignore the fields. **S8 SPA:** new keys `accountId`, `outbox:{account}`, `captureDraft:{account}`; the legacy keys `outbox`, `captureDraft`, `role`, `fullName`, `email` stay declared (read once for migration, then removed) until `SHIM-FE-001`'s contract step. No route changes. No env var. No DB schema change (`users.id` already exists and is `AUTOINCREMENT`, so never reused). |
| **Known dependents** | From `./run impact` (index current at `5d85f6ee539e`): `stores/auth.js` → AppShell, LoginPage, useAccount, NewUiHost, LoginView, SettingsView (+ every old view transitively); `useOutbox.js` → `tasks/stores/gtd.js` and every new-UI page; `captureDraft.js` → CaptureLine → ListFrame and the list pages; `api/client.js` → 13 direct dependents; `models.py` → every router; `routers/auth.py` → `main.py`, tool `me`. No import-derived test protection on the stores, views or the host (`BLIND-TEST-001`). |
| **Uncertain / dynamic areas** | `BLIND-FE-001`/`BLIND-FE-002` (template-only and dynamic imports). The storage event between tabs, `pagehide` ordering around `window.location.assign`, and `window.confirm` are browser behaviour no node test executes (`RISK-TEST-004`). An old tab still running the previous bundle after the deploy keeps writing legacy keys until it reloads. |
| **Analogous implementations** | Brief 0062 (storage that refuses writes: the memory-only outbox); brief 0052 (capture draft bound to the user); `shared/sessionEnd.js` (a pure rule the client only calls); `tests/threeIsolation.test.js` (a source scan that holds an isolation property). |
| **Delivery Pattern** | **Security or Operability Change** (failure scenario, control, adversarial proof) plus **Public-Surface Migration** for the storage keys and `/auth/me`: expand → migrate → switch here; contract deferred (`SHIM-FE-001`). |
| **Required tests** | Unit (frontend pure logic): `frontend/tests/browserStorage.test.js` — inventory, namespaces, purge, legacy migration, outbox decision, source scan. Store-level (node, no rendering): `frontend/tests/authStore.test.js` — role from `/me`, logout purge in a synthetic profile with a real `useOutbox` and the real draft, second account isolation, 401 locks. Adjusted: `useOutbox.test.js` (namespaced key). ASGI/REST: `backend/tests/unit/test_auth.py::TestAccountId`. Browser tier: **not available in this repository** (no browser runner; adding one needs a dependency and a browser download) — recorded in `RISK-TEST-004`. |
| **Intended scope** | The files above, the snapshots `ops/surfaces/{openapi,mcp-tools,spa}.json` where they really change, `rules/ledger.yaml`, `rules/shims.yaml`, `tools/fixtures/negative.sh`, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`, `docs/task-interface.md`, ADR 0050. **Not** in scope: server-side token revocation on logout (M2's `auth_version`), CSP (M7.4), moving the JWT out of `localStorage`. |
| **Base revision** | `5d85f6e` (`main`) |

## Failure scenario

Two people share a browser profile (a family laptop, a shared workstation). A signs in, captures
"Kündigung Arbeitsvertrag" while offline and types half a draft, then clicks *Abmelden*. Today
(`5d85f6e`) `logout()` removes `token`, `username`, `role`, `fullName`, `email` and nothing else:
`localStorage['outbox']` still holds the capture with its text, `localStorage['captureDraft']` the
draft. B opens devtools — or any script on the origin runs — and reads them. The username filters
in `useOutbox`/`captureDraft` are a display and send gate, not a confidentiality boundary
(`REV-006`). Separately, `auth.role` is initialised from `localStorage['role']`, so writing `admin`
there renders the admin UI (`RISK-SEC-001`; the REST guards still answer 403).

A third variant the namespacing must not open: a username is not a stable identity. If A's account
is deleted and someone registers the same username, a username-keyed namespace would hand A's
unsent ops to the new account.

## Storage inventory (by data class and account binding)

| Key | Class | Account-bound | After this change |
|---|---|---|---|
| `token` | credential | yes | kept; removed by logout and by a 401 |
| `username` | identity | yes | kept; removed by logout |
| `accountId` | identity | yes | **new**, from `/auth/me` `account_id`; removed by logout |
| `outbox:{account}` | outbox (task content) | yes | **new**, namespaced; removed by logout |
| `captureDraft:{account}` | draft (task content) | yes | **new**, namespaced; removed by logout |
| `role` | identity | yes | **legacy**: never read again; role lives in memory, from `/auth/me` on every mount |
| `fullName`, `email` | identity (PII) | yes | **legacy**: never written again; memory only, from `/auth/me` |
| `outbox`, `captureDraft` | outbox/draft | by `user` field only | **legacy**: the signed-in user's entries migrate into the namespace, the rest is removed by the next explicit logout |
| `theme`, `ui`, `inboxMode` | UI preference | no | kept across accounts — the only keys a logout leaves |

The task snapshot itself (the Pinia stores) is memory only; both UIs now leave with a full page
load, so it goes with the page.

## Controls

1. **One storage module.** `frontend/src/shared/browserStorage.js` declares every key with its
   class and is the only file that touches `localStorage` (a source-scan test holds that).
2. **Namespace by a stable id.** `GET /auth/me` returns `account_id` = `users.id` as a string
   (`AUTOINCREMENT`: never reused, survives a restore). Outbox and draft live under
   `…:{account_id}`. `login` drops the previous `accountId` and binds the one the login response
   names in the same step, so there is no unbound window after a login, even if `/auth/me` then
   fails. Only the previous deploy's session, on its first load before `/auth/me` answers, has a
   token and no id: its outbox keeps writing the legacy `outbox` key exactly as that deploy did
   (`queueKey`), so a reload loses nothing, and the next bind migrates it. Signed out, the outbox
   queues in memory. Only declared keys can be read or written at all (`isDeclared`).
3. **Explicit logout (D6).** Count the unsent ops (own namespace, any legacy queue, and the ops
   only the page holds — a refused write — which the outbox reports through `reportPending`;
   each op once). Non-zero
   → `window.confirm`: *Abbrechen* keeps everything, *OK* = "abmelden und lokale Änderungen
   verwerfen". Then remove `token`, `username`, `accountId`, the account's `outbox:`/`captureDraft:`
   keys and every legacy key, and leave with a full page load. Other tabs see the token go — or
   change to another sign-in, or the account id change — and leave or reload too; the listener is
   registered whether or not the tab started signed in.
4. **401 / offline locks.** The interceptor removes only the token. The namespace stays; a login of
   the same account (same `account_id`) sees it again, another account sees its own.
5. **Role from the server.** `auth.role` starts as `user` in memory and is set from `/auth/me` on
   every store creation; nothing reads `localStorage['role']`.
6. **One-time legacy cleanup.** On binding an account: legacy `role`/`fullName`/`email` are removed,
   and this account's legacy outbox ops and draft move into the namespace. A username alone does
   not prove "this account": a fresh login therefore drops the legacy draft (no timestamp to prove
   anything by) and marks the legacy ops `prior`; a `prior` op is adopted only when its `at` is not
   older than the account's `created_at`, and removed when it is (an earlier account's of the same
   name). Ops a still-running pre-deploy session left are its own and move as they are. On explicit
   logout: every legacy key is removed. From **2027-03-01** (`LEGACY_SWEEP_FROM`, the shim's
   expiry) every bind sweeps all legacy keys, whoever left them.

## Migration steps

- **Expand** (this change): `account_id` on `/auth/me`; namespaced keys declared and written.
- **Migrate** (this change, at runtime): the legacy queue/draft of the signed-in account moves on
  the first `/auth/me` after the deploy. Until then the session keeps writing the legacy queue, so
  nothing unsent is dropped by the upgrade. Two deliberate exceptions: after a fresh login a
  legacy draft is discarded, and a legacy op older than the account is removed (both cannot be
  shown to belong to the signing-in account).
- **Switch** (this change): new code reads and writes only the namespaced keys.
- **Contract** (deferred, `SHIM-FE-001`, expires **2027-03-01**): delete the legacy migration,
  the `prior` marking and the legacy `queueKey` fallback from `browserStorage.js`, but **keep** an
  unconditional sweep of the five legacy key names on every bind (already date-driven from
  2027-03-01), so a profile that never logged out explicitly is still cleaned; the S8 snapshot then
  keeps the five names only as swept keys. Trigger: the expiry, or earlier when the
  maintainer judges that every browser in use has loaded a post-switch bundle.

**Rollback.** The previous image ignores `account_id` and the namespaced keys. Ops migrated into
`outbox:{account}` are invisible to it — stranded, not lost: rolling forward again sends them. A
rollback across an unsent queue should therefore be avoided or announced; nothing is deleted by it.

## What the diff did beyond the intent

- `ops/structure-baseline.toml`: `frontend/src/shared/browserStorage.js` joins the hub allowlist
  (fan-in 11 by design: the single storage access point, like `api/client.js`). `RULE-ARCH-003`
  flagged it; the alternative — storage calls spread over the features — is what `REV-006` came from.
  `RISK-GOV-001`: the approval is not independent.
- `frontend/AGENTS.md` names the one-access-path rule; the root `AGENTS.md` was left alone (its byte
  budget, `RULE-DOC-002`, had no room for a row).
- `frontend/src/shared/messages.de.js` (`signout.discardQ`) and `messages.settings.de.js`
  (`set.signoutP` now says what the logout removes); README §Authentication documents `account_id`
  and what the browser keeps.
- A cross-tab reload: a tab that sees the token disappear goes to `/login`, so another tab's
  in-memory snapshot does not outlive the logout.

## Pre-checks

- `make check` GREEN at `5d85f6e` before any edit (25 s of 180 s).
- Red tests written before the control and observed failing — see ADR 0050 §Evidence. The source
  scan in `browserStorage.test.js` was additionally watched going red on a constructed violation
  (a `localStorage.getItem('outbox')` appended to `shared/theme.js`, then reverted).
- Round 1: `make check` GREEN on the change; `make verify` was not recorded here (corrected in
  round 2, below).

## Review round 2 (2026-11-24)

Reviewers found the unbound window and the username-matched migration weaker than this brief
claimed. Verified and fixed, each with a red test observed failing before the fix:

| Finding | Fix | Red test |
|---|---|---|
| A re-login whose `/auth/me` fails leaves no binding; logout then neither asks nor purges `outbox:<id>`/`captureDraft:<id>` | `POST /auth/login` returns `account_id`; `startSession` binds it | `authStore.test.js` "a re-login whose /auth/me fails…"; `test_auth.py::TestAccountId::test_login_names_the_account_too` |
| Unbound (first post-deploy load offline): captures memory only, lost on reload; logout silent | legacy `queueKey` fallback while a token exists without an id | "the first load after the deploy while offline…"; `useOutbox.test.js` "a session with no account bound yet…" |
| Logout ignores ops only the page holds (storage refused) | `reportPending` from `useOutbox`; `pendingChanges` counts the union of ids | "an unsent change that only the page holds…"; `browserStorage.test.js` "counts the live queue…" |
| Legacy migration by username hands a deleted account's text to a new account of the same name | `prior` marking at login, `created_at` proof, legacy draft dropped at login | "a deleted account's unsent text is never adopted…"; `test_me_names_when_the_account_was_created` |
| Raw accessors accept any key name | `isDeclared` guard on `readKey`/`writeKey`/`removeKey` | `browserStorage.test.js` "refuses a key the inventory does not declare…" |
| The contract step would remove the only legacy cleanup | date-driven sweep from 2027-03-01; shim removal text keeps the sweep | "after the shim expires, binding sweeps every legacy key…" |
| Cross-tab follow only for tabs that started signed in, and not on another sign-in | listener always registered; reloads on a changed token or account id | "the other open tabs" (2 tests) |
| This brief misstated register's `account_id` and deferred the `make verify` result | corrected above and below | — |

The regression guard "the same account, locked before the deploy, gets its unsent op back" passed
before and after (the legitimate re-login keeps its work).

Residual: the `created_at` line is drawn with the browser's clock against the server's; a skewed
client clock moves it by the skew (ADR 0050).

Gate, round 2 (2026-11-24, local, arm64): `make check` GREEN (17 s of 180 s). `make verify` GREEN
(145 s of 600 s), **with the container tier `py-test-container` skipped** — "the docker daemon is not
running" (`RISK-TEST-001`); it ran no container test, so CI has to. 57 negative-fixture arms
passed.

## Review round 3 (2026-11-24)

Both findings verified (the reviewer's reproduction holds against `2e54443`) and fixed, each with a
red test in `authStore.test.js` observed failing before the fix (5 tests: 5 failed, then green):

| Finding | Fix | Red test |
|---|---|---|
| A late `/auth/me` answer for an earlier account rebinds a newer account's session to the earlier namespace (its queue shown and sent under the newer token); one landing after a logout writes `accountId`/`username` back | `fetchMe` binds only when the profile's token is still the one it sent and no logout came between; `bindAccount` takes that `token` and refuses to replace a bound account id with another | "a late answer for the previous account does not rebind…", "a late answer after an explicit logout writes nothing…", "binding refuses to replace the account a login bound…" |
| *Back* after a logout restores the page from the back/forward cache with its snapshot; nothing reacts | `pageshow` listener in the auth store: a `persisted` restore of a logged-out or replaced session reloads (to `/login` without a token) | "a page restored from the back/forward cache" (2 red, 1 guard that a live session is not reloaded) |

Not done: `Cache-Control: no-store` on `index.html` (it would only make bfcache less likely, and
changes the deploy's nginx config for every page; the `pageshow` handler covers the restore). The
behaviour in a real browser's bfcache is part of the browser-tier gap (`RISK-TEST-004`): the node
test proves the handler, not that every browser fires `pageshow` with `persisted`.

## Deferred, with trigger

| Step | Trigger / date | Why not now |
|---|---|---|
| Contract: delete the legacy keys and migration (`SHIM-FE-001`) | expires **2027-03-01**, or earlier by the maintainer's judgement | browsers that have not signed in since the deploy still hold unsent legacy work |
| A browser-tier test of the logout dialog, the cross-tab reload and the bfcache restore after logout | a browser runner in CI (`RISK-TEST-004`) | no runner exists here; adding one needs a dependency and a browser download |
| Server-side revocation on logout | M2 (`auth_version`) | a different package; a copied JWT stays valid until expiry |
| Owner sign-off on resolving `RISK-SEC-001` | the merge of this change | `RISK-GOV-001`: one maintainer |
