# ADR 0018 — Refuse to boot, close CORS entirely, and pay for the inbox unification with a dated shim

- **Date:** 2026-08-25
- **Status:** Accepted
- **Scope:** `backend`, `ops`

## Context

Step 11's second wave closes the four findings SEC-2 left behind. Three of them have a
decision worth recording; the fourth (rate limiting) is conventional except in what it is
keyed on.

**SEC-1** — `config.py` ships a working JWT signing key. Anyone can read it in this public
repository and forge a token for any user of any deployment that never set one. Production
was checked on 2026-08-24 and holds a real 64-character secret, so this is not about this
deployment; it is about every other one.

**SEC-4** — `CORSMiddleware(allow_origins=["*"], allow_credentials=True, ...)`. Starlette
reflects the caller's own `Origin` back when credentials are enabled with a wildcard, so
every origin on the internet held full credentialed CORS access. Auth here is header-based
rather than cookie-based, so it was not directly CSRF-exploitable — but the browser's origin
barrier was gone entirely with nothing compensating.

**SEC-6** — `/inbox` authenticated through its own inline lookup, accepting the API key as
`Authorization: Bearer <key>` while every other route took `X-Api-Key`. Two authentication
implementations with different accepted shapes. They drift; that is the whole finding.

## Decision

### The application refuses to start on an unsafe secret

`startup_checks.assert_jwt_secret_is_safe()` rejects every default this repository has ever
shipped — including `changeme-set-in-.env`, which only ever appeared in `docker-compose.yml`
and is a *different string* from the one in `config.py` — plus an empty secret and anything
shorter than 32 characters.

**At startup, not at import.** `import app.main` must still succeed with no environment:
`RULE-DEP-001`'s import check, the unit tier, and any tooling that reads the app object would
otherwise need a secret provisioned before they could run at all. The literal default stays
in `config.py` and is now inert — it cannot reach a serving process — which turns
`WAIVER-SEC-001` from a scheduled remediation into a permanent justified suppression.

### CORS defaults to no origins, not to a guessed one

`CORS_ORIGINS` is empty by default and the middleware is not mounted at all when it is.

Empty is correct here rather than merely cautious: the SPA reaches the API through a
same-origin `/api` proxy — nginx in production, vite in development — so **no browser ever
makes a cross-origin request to this API**. Agents and MCP clients are not browsers and CORS
does not apply to them in either direction. Both proxy configurations were read before
choosing this, because the failure mode of guessing wrong is a working application that
stops working for reasons the browser reports unhelpfully.

### `/inbox` comes through `get_current_user`, and the old shape survives as a dated shim

The route no longer implements authentication. What it accepted — an API key in the Bearer
slot — is now a branch in `get_current_user`, tried last, after a real JWT decode fails.

That branch is a **shim, not a design**: every agent, MCP client and webhook caller sends the
key that way today, so deleting the shape in the same change that unifies the paths would
break all of them at once. It is recorded in the new `rules/shims.yaml` with a removal step,
an owner and an expiry of 2026-11-25, and `RULE-SEC-002` fails the gate when a shim is
incomplete or past its date.

The shim lives in `get_current_user`, so it applies to **every** route rather than only
`/inbox`. That is a deliberate widening and the honest consequence of unification: one
authentication path means one set of accepted shapes. Confining the shim to `/inbox` would
have meant keeping a per-route exception, which is the thing being removed.

### Rate limiting is keyed on username, not IP

An attacker who can rotate source addresses defeats an IP-keyed limiter without slowing
down, and the thing being protected is an account rather than a network location.

The cost is stated rather than hidden: someone who knows a username can deny it password
login for the window. That is survivable here because API keys are checked *before* any
password path, so agents, MCP clients and the webhook keep working through a lockout — and
because decision **F1** puts this at one operator with two accounts, where denial-of-service
against a known username is a smaller risk than an unthrottled guess against an unknown
password.

Unknown usernames are throttled identically. Skipping them would turn the limiter into a user
enumeration oracle, where "throttled" means "this account exists".

## Alternatives considered

- **Fail at import rather than at startup.** Rejected: it makes a secret a prerequisite for
  reading the app object, which breaks the import check that exists to catch a different
  class of failure entirely.
- **Default `CORS_ORIGINS` to the production hostname.** Rejected as a guess dressed as a
  default. Nothing in the browser path needs it, and a default that is never exercised is a
  default nobody notices is wrong.
- **Keep the wildcard but drop `allow_credentials`.** Rejected: it narrows the exposure
  without answering why an API nothing calls cross-origin advertises itself to every origin.
- **Confine the Bearer-key shim to `/inbox`.** Rejected above — a per-route exception is what
  SEC-6 *is*.
- **Delete the Bearer shape immediately.** Rejected: it breaks every existing caller in one
  step, which is precisely what expand → migrate → switch → contract exists to avoid.
- **Key the limiter on IP, or on IP and username together.** Rejected: rotating source
  addresses is cheap, and an attacker who does it faces no limit at all.

## Consequences

- SEC-1, SEC-4, SEC-6 and SEC-8 are closed. Step 11 is complete.
- **`/inbox`'s public surface changes in three ways**, all deliberate and all previously
  pinned by characterization tests that named Step 11 as the step that would change them: an
  unauthenticated request is now `401` rather than `422`; `X-Api-Key` now works, as the README
  always claimed; a JWT now works.
- **Every route now accepts an API key in the Bearer slot** while `SHIM-SEC-006` lives.
- `rules/shims.yaml` and `RULE-SEC-002` exist, so the contract step of any future migration
  is enforced rather than intended.
- `backend/app/dependencies.py` gains a sixth dependent and its hub baseline was raised
  deliberately. One more dependent on the authentication choke point is the intended shape of
  this fix; the alternative was a second authentication implementation.
- **The limiter is in-process and per-worker** (`RISK-SEC-003`). Under F1 that is the whole
  population; a second worker multiplies the effective limit by the process count.
