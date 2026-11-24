# Change Impact Brief 0075 — Local browser data on logout

| Field | Value |
|---|---|
| **Requested outcome** | Security remediation package M6 (`REV-006` and `RISK-SEC-001`) of the November 2026 security plan, ordered by Uli on **2026-11-24** ("please fully implement security-fixes for all"). After an explicit logout, a synthetic browser profile holds no task content, draft, outbox entry, token or role of that account; a second account never sees the first account's namespace; a role written into `localStorage` never shows the admin UI after `/auth/me` has answered. |
| **Owning unit** | `fe/shared` — `frontend/src/shared/browserStorage.js` (new: the key inventory, every storage access, namespacing, purge, legacy cleanup), `frontend/src/composables/useOutbox.js`, `useTheme.js`, `useDarkMode.js`, `frontend/src/shared/uiFlag.js`, `inboxMode.js`, `frontend/src/api/client.js`, `keepalive.js`. `fe/identity` — `frontend/src/stores/auth.js`, `frontend/src/identity/useAccount.js`, `frontend/src/views/SettingsView.vue`. `fe/tasks` — `frontend/src/tasks/captureDraft.js`, `frontend/src/tasks/components/CaptureLine.vue`. `fe/app` — `frontend/src/router/index.js`, `frontend/src/router/NewUiHost.vue`. `fe/layout` — `frontend/src/components/AppShell.vue`. `be/leaves` — `backend/app/models.py`. `be/routers` — `backend/app/routers/auth.py`. `ops` — `tools/surfaces.py`, `ops/surfaces/`. `docs` — this brief, ADR 0047. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §2, §3 (pure frontend rules in `frontend/src/shared/`), §5 (REST, MCP tool `me_auth_me_get`, localStorage keys are public surfaces), §9 (the S8 capture is the check behind `RULE-SURF-001`); [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (tests cover logic, not components; features never import features); [`backend/AGENTS.md`](../../backend/AGENTS.md). |
| **Governed by** | ADR 0042 (the `ui` key, kept as a cross-account preference); ADR 0007 (frontend test scope); new **ADR 0047** (local browser data on logout). |
| **Rule IDs touched** | `RULE-SURF-001` — its S8 capture now also reads the key declarations in `frontend/src/shared/browserStorage.js` (otherwise the namespaced keys would be invisible to the snapshot). Check, ledger statement, negative fixture and docs change in the same commit (META-RULE). No rule added or removed. |
| **Risks touched** | `RISK-SEC-001` — resolved when its closing criterion holds (role from a server response on every mount, never from storage). `RISK-TEST-004` — names the logout-confirm path as the remaining unrendered gap. New `RISK-FE-001` — a session that ends without an explicit logout (401, expiry, closed browser) leaves that account's namespace in the profile, locked rather than wiped (decision D6). New `SHIM-FE-001` — the legacy-key migration and cleanup code, with a removal date. |
| **Entry points** | Every `localStorage` read/write in `frontend/src` (inventory below); `auth.login`, `auth.fetchMe`, `auth.logout`; the axios 401 interceptor; the outbox load/save/flush; the capture draft; `GET /auth/me`. |
| **Affected public surfaces** | **S1 REST / S2 MCP:** `GET /auth/me` (and therefore the MCP tool `me_auth_me_get`) gains an optional `account_id` string — additive; old clients ignore it, `POST /auth/register`'s `UserInfo` leaves it `null`. **S8 SPA:** new keys `accountId`, `outbox:{account}`, `captureDraft:{account}`; the legacy keys `outbox`, `captureDraft`, `role`, `fullName`, `email` stay declared (read once for migration, then removed) until `SHIM-FE-001`'s contract step. No route changes. No env var. No DB schema change (`users.id` already exists and is `AUTOINCREMENT`, so never reused). |
| **Known dependents** | From `./run impact` (index current at `5d85f6ee539e`): `stores/auth.js` → AppShell, LoginPage, useAccount, NewUiHost, LoginView, SettingsView (+ every old view transitively); `useOutbox.js` → `tasks/stores/gtd.js` and every new-UI page; `captureDraft.js` → CaptureLine → ListFrame and the list pages; `api/client.js` → 13 direct dependents; `models.py` → every router; `routers/auth.py` → `main.py`, tool `me`. No import-derived test protection on the stores, views or the host (`BLIND-TEST-001`). |
| **Uncertain / dynamic areas** | `BLIND-FE-001`/`BLIND-FE-002` (template-only and dynamic imports). The storage event between tabs, `pagehide` ordering around `window.location.assign`, and `window.confirm` are browser behaviour no node test executes (`RISK-TEST-004`). An old tab still running the previous bundle after the deploy keeps writing legacy keys until it reloads. |
| **Analogous implementations** | Brief 0062 (storage that refuses writes: the memory-only outbox); brief 0052 (capture draft bound to the user); `shared/sessionEnd.js` (a pure rule the client only calls); `tests/threeIsolation.test.js` (a source scan that holds an isolation property). |
| **Delivery Pattern** | **Security or Operability Change** (failure scenario, control, adversarial proof) plus **Public-Surface Migration** for the storage keys and `/auth/me`: expand → migrate → switch here; contract deferred (`SHIM-FE-001`). |
| **Required tests** | Unit (frontend pure logic): `frontend/tests/browserStorage.test.js` — inventory, namespaces, purge, legacy migration, outbox decision, source scan. Store-level (node, no rendering): `frontend/tests/authStore.test.js` — role from `/me`, logout purge in a synthetic profile with a real `useOutbox` and the real draft, second account isolation, 401 locks. Adjusted: `useOutbox.test.js` (namespaced key). ASGI/REST: `backend/tests/unit/test_auth.py::TestAccountId`. Browser tier: **not available in this repository** (no browser runner; adding one needs a dependency and a browser download) — recorded in `RISK-TEST-004`. |
| **Intended scope** | The files above, the snapshots `ops/surfaces/{openapi,mcp-tools,spa}.json` where they really change, `rules/ledger.yaml`, `rules/shims.yaml`, `tools/fixtures/negative.sh`, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`, `docs/task-interface.md`, ADR 0047. **Not** in scope: server-side token revocation on logout (M2's `auth_version`), CSP (M7.4), moving the JWT out of `localStorage`. |
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
   `…:{account_id}`; with no bound id nothing is persisted (the outbox queues in memory, as it
   does when storage refuses writes). `login` drops the previous `accountId` before the new token
   is used, so nothing can read the previous account's namespace in between.
3. **Explicit logout (D6).** Count the unsent ops (own namespace plus any legacy queue). Non-zero
   → `window.confirm`: *Abbrechen* keeps everything, *OK* = "abmelden und lokale Änderungen
   verwerfen". Then remove `token`, `username`, `accountId`, the account's `outbox:`/`captureDraft:`
   keys and every legacy key, and leave with a full page load. Other tabs see the token go and
   reload too.
4. **401 / offline locks.** The interceptor removes only the token. The namespace stays; a login of
   the same account (same `account_id`) sees it again, another account sees its own.
5. **Role from the server.** `auth.role` starts as `user` in memory and is set from `/auth/me` on
   every store creation; nothing reads `localStorage['role']`.
6. **One-time legacy cleanup.** On binding an account: legacy `role`/`fullName`/`email` are removed,
   the signed-in user's legacy outbox ops and draft move into the namespace. On explicit logout:
   every legacy key is removed.

## Migration steps

- **Expand** (this change): `account_id` on `/auth/me`; namespaced keys declared and written.
- **Migrate** (this change, at runtime): the legacy queue/draft of the signed-in user moves on the
  first `/auth/me` after the deploy; nothing unsent is dropped by the upgrade.
- **Switch** (this change): new code reads and writes only the namespaced keys.
- **Contract** (deferred, `SHIM-FE-001`, expires **2027-03-01**): delete the legacy migration and
  cleanup code and the legacy declarations from `browserStorage.js`; the S8 snapshot then loses
  `outbox`, `captureDraft`, `role`, `fullName`, `email`. Trigger: the expiry, or earlier when the
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
- Red tests written before the control and observed failing — see ADR 0047 §Evidence. The source
  scan in `browserStorage.test.js` was additionally watched going red on a constructed violation
  (a `localStorage.getItem('outbox')` appended to `shared/theme.js`, then reverted).
- `make check` GREEN on the change; `make verify` — see the commit / PR for its outcome. The
  container tier cannot run on arm64 (`RISK-TEST-001`); CI runs it.

## Deferred, with trigger

| Step | Trigger / date | Why not now |
|---|---|---|
| Contract: delete the legacy keys and migration (`SHIM-FE-001`) | expires **2027-03-01**, or earlier by the maintainer's judgement | browsers that have not signed in since the deploy still hold unsent legacy work |
| A browser-tier test of the logout dialog and the cross-tab reload | a browser runner in CI (`RISK-TEST-004`) | no runner exists here; adding one needs a dependency and a browser download |
| Server-side revocation on logout | M2 (`auth_version`) | a different package; a copied JWT stays valid until expiry |
| Owner sign-off on resolving `RISK-SEC-001` | the merge of this change | `RISK-GOV-001`: one maintainer |
