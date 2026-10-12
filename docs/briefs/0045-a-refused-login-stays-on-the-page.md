# Change Impact Brief 0045 — A refused login stays on the page

| Field | Value |
|---|---|
| **Requested outcome** | Reported as "if I try to log in I fall back to login". A wrong password must answer with its message on the login form. Today the form comes back empty and silent, which cannot be told apart from a login that is broken. |
| **Owning unit** | `fe/shared` — [`frontend/src/api/client.js`](../../frontend/src/api/client.js) and the new [`frontend/src/shared/sessionEnd.js`](../../frontend/src/shared/sessionEnd.js) |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (a frontend rule lives in `frontend/src/shared/`, pure and tested); [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (tests cover logic, not components) |
| **Governed by** | [ADR 0007](../adr/0007-frontend-test-scope.md) — frontend logic lives in `shared/` and is tested there |
| **Rule IDs introduced** | None. |
| **Entry points** | The response interceptor in [`frontend/src/api/client.js`](../../frontend/src/api/client.js); `endsSession` in [`frontend/src/shared/sessionEnd.js`](../../frontend/src/shared/sessionEnd.js) |
| **Affected public surfaces** | **None.** No route, MCP tool, SPA route or localStorage key moves; `POST /auth/login` answered 401 with `Invalid credentials` before and does now. |
| **Known dependents** | Every caller of the API client: `frontend/src/stores/auth.js`, `frontend/src/stores/tasks.js`, `frontend/src/views/LoginView.vue`, `frontend/src/views/SettingsView.vue`, `frontend/src/components/TaskModal.vue`, `frontend/src/components/ProjectPlanModal.vue`, and through the stores every view. Their behaviour on an expired token is unchanged. |
| **Uncertain / dynamic areas** | `RISK-TEST-004` — the interceptor's wiring, the redirect and the rendering of the message in `LoginView.vue` are untested; only the decision is. This defect lived on the SPA/API boundary, which is that risk's re-open trigger: the owner should decide whether it re-opens. `BLIND-TEST-001` does not apply (no router changes). **Not proven:** that the reporter's credentials were in fact being refused. The server cannot be asked without them; what is established is that production is healthy, that an API key authenticates, and that a refused login produces exactly the reported symptom. |
| **Analogous implementations** | [Brief 0031](0031-empty-string-clears.md) — a rule that sat inline in a component, shipped a defect, and moved to `frontend/src/shared/taskPayload.js` with a test. |
| **Delivery Pattern** | **Bug Fix**, recorded in [`docs/operations.md`](../operations.md). |
| **Required tests** | [`frontend/tests/sessionEnd.test.js`](../../frontend/tests/sessionEnd.test.js), written first and watched fail: a 401 on a token-carrying request ends the session; a 401 on `/auth/login` does not, with or without a stale token attached; a 401 on a request without a token does not; other statuses and errors without a response or a request do not. |
| **Intended scope** | The rule, its call site, its test, this brief and the operations entry. **Not** in scope: the `window.location.href` reload itself (a router navigation would be gentler, and is a behaviour change for every expired session), and `fetchMe` swallowing its errors. |
| **Base revision** | `4ccdb3b` |

## Behaviour change

The API client treated every 401 as an expired session: remove the token, reload `/login`. But
`POST /auth/login` answers 401 for a wrong username or password, so the page reloaded before
`LoginView.vue` could render `Invalid credentials`. The 429 of the login rate limit was never
affected and has always shown its message — which made the silent case look even more like a
fault in the application.

`endsSession(error)` now makes the decision. A 401 ends the session only when the request carried
an `Authorization` header and was not `/auth/login`. Without a token there is no session to end;
a refused login is an answer for the form.

An expired or revoked token behaves as before: the next API call is refused, the token is dropped
and the login page is shown.

## Pre-checks

- The test failed before the module existed and passes with it; frontend **80 → 87 passed**.
- The shape the test assumes — `error.config.url` as the path given to the client, without the
  `/api` base, and `error.config.headers.Authorization` as set by the request interceptor — was
  read off a real axios rejection, not assumed.
- `make verify`: **GREEN**, 107s of 600s. Gate conformance unchanged: 56 fixture arms passed,
  46 of 49 executable rules proven able to fail.
