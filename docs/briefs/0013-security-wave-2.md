# Change Impact Brief 0013 — Security wave 2: boot refusal, closed CORS, one auth path, throttled login

| Field | Value |
|---|---|
| **Requested outcome** | Close the four findings Step 11 left open — SEC-1, SEC-4, SEC-6, SEC-8 — so that Step 11 is complete. |
| **Owning unit** | `be/leaves`, `be/routers`, `be/adapters/db`, `docs`, `ops`, `tests` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`docs/security.md`](../security.md), [`docs/change-workflow.md`](../change-workflow.md) |
| **Rule IDs introduced** | `RULE-SEC-002` (shims are recorded and expire) |
| **Risks recorded** | `RISK-SEC-003` (the limiter is in-process and per-worker) |
| **Waivers closed** | `WAIVER-SEC-001` → resolved, and demoted to a justified suppression |
| **Shims opened** | `SHIM-SEC-006`, expires 2026-11-25 |
| **Entry points** | [`backend/app/startup_checks.py`](../../backend/app/startup_checks.py), [`backend/app/rate_limit.py`](../../backend/app/rate_limit.py), [`backend/app/dependencies.py`](../../backend/app/dependencies.py), [`backend/app/main.py`](../../backend/app/main.py) |
| **Affected public surfaces** | `POST /inbox` changes in three ways (below). `POST /auth/login` gains a **429**. No route is added, removed or renamed; no MCP tool name changes. |
| **Known dependents** | Every router depends on `dependencies.py`; its hub baseline was raised from 5 to 6 deliberately. |
| **Uncertain / dynamic areas** | `RISK-SEC-003`. `SHIM-SEC-006` has no mechanical evidence of disuse — this repository cannot see what its callers send. |
| **Analogous implementations** | The waiver register and `RULE-RULE-002`: `rules/shims.yaml` and `RULE-SEC-002` are the same shape, for the same reason — a date nothing checks is a wish. |
| **Delivery Pattern** | **Security or Operability Change** for all four, plus **Public-Surface Migration** (expand) for SEC-6. |
| **Required tests** | 19 new tests, each constructing the thing the control refuses. One new negative fixture. |
| **Intended scope** | Step 11's remaining half. Step 12 onward untouched. |
| **Base revision** | `dc5c783` |

## SEC-1 — refuse to serve rather than warn

A default signing key in a public repository is not a warning-level problem: anyone can read
it here and forge a token for any user of a deployment that never set one. The only control
that works is refusing to start.

`startup_checks` rejects **every** default this repository has shipped — including
`changeme-set-in-.env`, which lives only in `docker-compose.yml` and is a *different string*
from the one in `config.py`; a check that knew about only one of them would have passed a
deployment running the other — plus an empty secret and anything under 32 characters.

It runs at **startup, not import**. `import app.main` must still succeed with no environment
or `RULE-DEP-001`'s import check, the unit tier and the OpenAPI tooling all need a secret
provisioned first. The literal default therefore stays and is now inert, which is why
`WAIVER-SEC-001` becomes a justified suppression rather than disappearing.

**No effect on production**, which holds a real 64-character secret (verified 2026-08-24).

## SEC-4 — no origins, rather than a guessed one

`allow_origins=["*"]` with `allow_credentials=True` makes Starlette reflect the caller's own
`Origin`, so every origin held full credentialed access.

The replacement defaults to **empty**, and the middleware is not mounted at all when it is.
That is correct rather than merely safe, and I read both proxy configurations before
concluding it: `frontend/nginx.conf` proxies `/api/` to the backend in production, and
`vite.config.js` does the same in development. The browser always talks to its own origin.
Agents and MCP clients are not browsers.

Guessing the production hostname as a default was the tempting alternative and was rejected —
a default that is never exercised is one nobody notices is wrong.

## SEC-6 — one authentication path, and a dated receipt for the old one

`/inbox` no longer implements authentication; it takes `Depends(get_current_user)` like every
other route. What it used to accept — the API key in the Bearer slot — is now a branch in
`get_current_user`, tried **last**, after a real JWT decode fails, so it costs one database
read only for a credential that was going to be rejected anyway.

That branch is `SHIM-SEC-006`, and the shim applies to **every** route, not only `/inbox`.
That is the honest consequence of unification: one path means one set of accepted shapes.
Confining it to `/inbox` would have preserved a per-route exception, which is what SEC-6 *is*.

`rules/shims.yaml` is new, and so is `RULE-SEC-002`. Expand → migrate → switch → contract only
works if the contract step happens, and it is the step that gets skipped — the old shape keeps
working, nothing fails, and "temporary" becomes permanent by default rather than by decision.

### The three surface changes, stated plainly

All three were pinned by characterization tests that named Step 11 as the step that would
change them. Each of those tests expired with the behaviour it described.

| `POST /inbox` | Before | After |
|---|---|---|
| No credential | `422` (the header was a route parameter) | `401` |
| `X-Api-Key` | `422` — the one route where the README's claim was false | `201` |
| A JWT | `401` | `201` |

## SEC-8 — throttle the account, and say what that costs

bcrypt is a cost ceiling, not a control: it slows a brute force without ever stopping one.

Keyed on **username**, because an attacker who rotates source addresses defeats an IP-keyed
limiter without slowing down. The cost is real and recorded rather than hidden: someone who
knows a username can deny it password login for the window. It is survivable because API keys
are checked before any password path — an agent keeps working through a lockout, and there is
a test asserting exactly that.

Unknown usernames are throttled identically. Exempting them would make the limiter a user
enumeration oracle, where "throttled" means "this account exists".

The check runs *before* the password is verified, so a locked-out username buys an attacker no
bcrypt work — otherwise the limiter would hand over the CPU cost as a lever.

## What the gate caught on the way in

Two things, both correctly:

- **`RULE-SEC-001`** went red the moment `/inbox` was unified — `POST /inbox declares open but
  the handler enforces user`. The rule added one change earlier, doing its job on a real
  change rather than on a fixture.
- **`RULE-ARCH-003`** went red on `dependencies.py` fan-in rising 5 → 6. Raised deliberately
  in `ops/structure-baseline.toml` with the reason: one more dependent on the authentication
  choke point is the *intended* shape of this fix, and the alternative was a second
  authentication implementation.

## Behaviour change

**Yes, four.** Stated explicitly because none of this is a refactor:

1. The application refuses to start on a default, empty or short `JWT_SECRET`. No effect on
   production; a third-party deployment on a default will stop booting, which is the point.
2. No cross-origin request is granted unless `CORS_ORIGINS` names the origin. Nothing in the
   shipped SPA is affected.
3. `POST /inbox` accepts more credentials and returns `401` instead of `422` when given none.
4. `POST /auth/login` returns `429` after 10 failures for a username within 5 minutes.
