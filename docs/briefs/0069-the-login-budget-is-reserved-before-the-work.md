# Change Impact Brief 0069 — The login budget is reserved before the work

| Field | Value |
|---|---|
| **Requested outcome** | Finding **REV-003** (Codex review of audit run `20261118T131510Z-claude`, 2026-11-24) and the residual risk **`RISK-SEC-003`**: the login limiter checked the budget *before* the asynchronous account lookup and recorded a failure only *after* the password check, so any number of parallel requests passed the check before the first failure was counted; expired entries were removed only when the same name was used again, so new random names grew the module dict without bound. Ordered by Uli on **2026-11-24** as milestone M3.2 of the security remediation plan. Closing criterion (plan §5): pre-reservation, parallel budget and bounded store tested. Plan §4 M3.2 adds: a TTL, a global sweep and a hard maximum key count; at least three tiers (normalised account, the network source as seen at a trusted proxy, a global emergency budget), proxy headers accepted only from known proxies, otherwise the socket peer; the lockout balance and the API-key path documented; the multi-worker re-open trigger kept executable; failed logins not written to `audit.db` without bound. Acceptance: a synthetic parallel burst does not exceed the account budget, starts no KDF work once the budget is exhausted, and keeps the key count under the cap; the serial tests and the uniform error stay green. |
| **Owning unit** | `be/leaves` — `backend/app/rate_limit.py` (rewritten: a lock-protected, three-tier, reservation-based limiter with a bounded store and aggregated refusal reporting; `source_of` for the trusted-proxy rule), `backend/app/config.py` (four new settings). `be/routers` — `backend/app/routers/auth.py` (`login` reserves before the lookup and closes the reservation on every path). `be/app` — `backend/app/main.py` (one startup line saying which source the limiter counts). `ops` — `backend/Dockerfile` (`--no-proxy-headers`: one trust decision, not two), `frontend/nginx.conf` (`X-Forwarded-For` appended, not passed through), `ops/deploy/docker-compose.yml` and `docker-compose.yml` (`TRUSTED_PROXIES` passed through). `docs` — this brief, `README.md`, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`, `backend/AGENTS.md`. `rules` — `rules/ledger.yaml` (`RISK-SEC-003` statement narrowed, not removed). `tests` — `backend/tests/unit/test_login_budget.py` (new), `backend/tests/unit/test_security_wave.py` (unchanged, must stay green). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §5 (REST through the migration pattern; env vars documented in README, `RULE-SURF-002`), §6 (`rules/ledger.yaml` needs owner approval — `RISK-GOV-001`), §10 (horizontal scaling out of scope); [`backend/AGENTS.md`](../../backend/AGENTS.md) (a leaf depends on nothing but leaves; an audit write never fails a request). No gate rule is added or changed, so the META-RULE is not engaged. |
| **Governed by** | Respected: [ADR 0018](../adr/0018-cors-startup-refusal-and-the-inbox-shim.md) (the limiter is in-process and per-worker on purpose under F1 — kept), [ADR 0026 — The audit log](../adr/0026-the-audit-log.md) (no IP address or caller fingerprint in an audit row — kept: the source tier's refusals are recorded without the address), [ADR 0044](../adr/0044-credential-lifecycle-jwt-password-and-api-key.md) (uniform login work and the uniform 401 — kept). No new ADR: the design is the one plan §4 M3.2 prescribes; the two choices it leaves open (what happens at the key cap; how uvicorn's own proxy-header trust interacts) are recorded here under *Decisions* and are local to this module. |
| **Rule IDs introduced** | None. |
| **Entry points** | `POST /auth/login` (REST-only — the `auth` tag is not on the MCP allowlist, ADR 0037; `./run impact` lists `mcp_tools: ['login']`, which is the index's name-derived guess, not the surface: `ops/surfaces/mcp-tools.json` has no `login`). |
| **Affected public surfaces** | **REST/OpenAPI: unchanged.** Same route, same statuses (200 / 401 / 422 / 429), same 401 detail `Invalid credentials`, same 429 detail and `Retry-After` header; `ops/surfaces/openapi.json` unchanged. A 429 can now also come from the source or global budget, not only the account one — the documented status and body are the same. Since the review round (R1) `PUT /auth/password` can answer 429 with `Retry-After` too, before verifying the current password — an additive status on an existing route, undeclared in OpenAPI exactly like the login's 429, so the snapshot does not move; both SPA callers already map an unknown status to a generic failure. MCP tools unchanged (27). DB schema unchanged (no column; the audit table is not touched — same event names, same columns). **Env vars: four added, additive, each with a default that keeps a deploy without them working:** `LOGIN_SOURCE_RATE_LIMIT` (30), `LOGIN_GLOBAL_RATE_LIMIT` (300 since the review round; 100 before), `LOGIN_RATE_MAX_KEYS` (10000), `TRUSTED_PROXIES` (empty: no proxy header is trusted). Documented in README (`RULE-SURF-002`). `LOGIN_RATE_LIMIT` keeps its name and meaning (the account budget). SPA routes and `localStorage` keys unchanged. |
| **Known dependents** | From `./run impact` (index `current`, revision `2ca39f03c8b9`, 1767 nodes / 2845 edges): `rate_limit.py` → `routers/auth.py` → `main.py` (routes `POST /login`, the other `/auth` routes); `config.py` → `auth.py`, `database.py`, `dependencies.py`, `logging_setup.py`, `main.py`, `rate_limit.py`, `services/{password_reset,storage_migration}.py`, `startup_checks.py`, `task_storage.py`, transitively every router; `audit.py` → `dependencies.py`, `main.py`, `routers/{admin,auth,tasks}.py`, `services/{password_reset,storage_migration}.py`. `frontend/nginx.conf`, `backend/Dockerfile`, both compose files: unit `ops`, no import dependents. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — `routers/auth.py` has no import-derived test protection; it is exercised through the TestClient and `httpx.ASGITransport`. `BLIND-NGINX-001` — nginx.conf is templated at start; the effective header is the checked-in line only because `X-Forwarded-For` carries no `${…}`. `BLIND-OPS-001`/`RISK-OPS-002` — what Traefik in front of nginx sends, which addresses Traefik and nginx have on `traefik-public`, and whether any other peer on that network can reach nginx or the backend directly are **production facts this repository cannot see** (plan M0). The source tier is therefore correct only to the extent the operator's `TRUSTED_PROXIES` is; its default (empty) is the safe direction, not the precise one. |
| **Analogous implementations** | `test_last_admin_concurrency.py` (brief 0068): a parallel ASGI burst on real connections with a barrier that proves the requests were in flight together. `startup_checks` / `logging_setup.resolve_level`: a configuration value that is wrong falls back to the conservative behaviour and says so at boot. |
| **Delivery Pattern** | **Security or Operability Change** — failure scenario, control, adversarial red test written first and observed failing. The four env vars are an **additive** public-surface change (expand only): every one has a default under which the previous deploy's environment boots and is at least as safe for confidentiality; for availability the global brake is a new cross-account lockout lever, stated in the review round below. No stored data changes shape, so there is nothing to migrate or contract; stated rather than skipped. |
| **Required tests** | Parallel (ASGI, one account, a burst of 40 wrong-password logins held together before the KDF): at most `LOGIN_RATE_LIMIT` reach the password check, the rest are 429 without KDF work. Parallel (threads against the limiter, a barrier): no tier hands out more reservations than its budget. Unit: in-flight reservations count; a success releases its reservation and clears the account tier only; an exception between reserve and close counts as a failure; TTL and a **global** sweep remove other names' expired entries; the key count never exceeds `LOGIN_RATE_MAX_KEYS` under a random-name flood, which is refused rather than evicting a victim's counter; the source and the global tier each stop a spray across many names; account keys are normalised (case, NFKC) so spelling variants share one budget; `source_of` ignores `X-Forwarded-For` from an untrusted peer, takes the right-most untrusted hop behind trusted ones, cannot be spoofed from the left, groups IPv6 by /64, and refuses `0.0.0.0/0` and malformed `TRUSTED_PROXIES` entries. ASGI/REST: the existing serial suite (`TestLoginIsRateLimited`) and the uniform 401 stay green; a locked account's refusals write a bounded number of `auth.login.throttled` rows that still carry the count; the source tier's rows carry no address. Ops: the Dockerfile CMD has `--no-proxy-headers` and no `--workers`, neither compose file sets `WEB_CONCURRENCY` or replicas (the executable form of `RISK-SEC-003`'s re-open trigger), nginx appends `X-Forwarded-For`, and the deploy compose passes `TRUSTED_PROXIES`. Container: not applicable — no Taskwarrior path changes; the existing suite runs. Frontend: not applicable — no response changes. |
| **Intended scope** | REV-003 and the parts of `RISK-SEC-003` that are code. **Not** in scope: a shared limiter across workers or hosts (needed only when the re-open trigger fires); audit retention and the audit size budget (M8, `RISK-OPS-006`); request-body limits beyond the existing 16 KiB login limit (M8, `RISK-SEC-004`); MCP session budgets (M5, REV-004); any production action, including choosing the production `TRUSTED_PROXIES` value. |
| **Base revision** | `2ca39f0` (`security/m3-1-last-admin`) |

## Failure scenario

1. **The parallel burst (REV-003).** Mallory knows Alice's username. She opens 50 connections and sends 50
   `POST /auth/login` for `alice` at once. Each request runs `seconds_until_retry("alice")` — 0, no failure
   recorded yet — and then awaits the account lookup. All 50 are past the check before the first one reaches
   `record_failure`. Each then runs one Argon2id and one bcrypt operation and records its failure. The
   account budget of 10 has been spent five times over, and the attacker got 50 guesses and 50 KDF
   operations' worth of CPU for the price of one window. Repeat every 300 s.
2. **The random-name flood.** Mallory sends logins for `u0001`, `u0002`, … Each records one failure under a
   new dict key. An entry is removed only when the *same* name is tried again after its window, which never
   happens, so `_failures` grows with every request until the process restarts. Each request also costs
   the server the full KDF work and writes one `auth.login.failed` row to `audit.db`.
3. **The spray.** Ten guesses per name, unlimited names: a password spray across every username Mallory can
   guess is unthrottled, because the only tier is the account.

## Decisions

- **Reserve, then work, then close.** `rate_limit.reserve(username, source)` takes one slot in each tier
  under one `threading.Lock` before the handler awaits anything. A tier is full when its failures *plus
  in-flight reservations* reach its budget. The reservation is a context manager: `succeed()` releases the
  slot and clears the account tier (the old behaviour: proving the password resets that account's budget),
  `fail()` turns the slot into a recorded failure, and leaving the block any other way — an exception, a
  cancelled request — counts as a failure. A slot cannot leak and a dropped connection cannot escape the
  budget.
- **Three tiers, each a hard ceiling:** account (`LOGIN_RATE_LIMIT`, key: NFKC + casefold of the name,
  stored as a 16-byte BLAKE2b digest so a 16 KiB name costs the store 16 bytes), source
  (`LOGIN_SOURCE_RATE_LIMIT`, key: the address `source_of` decides, IPv4 /32 or IPv6 /64), global
  (`LOGIN_GLOBAL_RATE_LIMIT`, one key). A success clears only the account tier: an attacker with a valid
  account of their own must not be able to reset their source counter by logging in between guesses.
- **The key cap refuses, it does not evict.** When the account or source tier holds `LOGIN_RATE_MAX_KEYS`
  live keys after a sweep, a new key is refused with 429. Evicting the oldest entry would let a flood of
  random names flush the victim's counter — a bypass. With the defaults the cap is unreachable anyway: every
  live key holds a failure or a reservation, and the global tier caps those at 100, so the store holds at
  most ~200 keys; the cap is the guarantee that holds even if someone raises the global budget.
- **Sweep globally, on a clock.** Every `reserve` runs a full sweep when the last one is older than
  `min(window, 60 s)`, or when a tier reaches the cap. A sweep drops every key whose failures have all
  expired and which has no reservation in flight.
- **Proxy headers only from a known proxy.** `source_of(peer, x_forwarded_for)` starts at the socket peer. If
  the peer is in `TRUSTED_PROXIES` it walks `X-Forwarded-For` from the right, skipping trusted hops, and
  stops at the first address that is not a trusted proxy. Entries to the left of that — the ones a client can
  write — are never read. An unparseable hop where an address should be is one shared key, not the string
  itself. `TRUSTED_PROXIES` entries that do not parse, and any network of prefix length 0, are ignored and
  reported at boot: a mistake there trusts fewer hops, never more.
- **One trust decision, not two.** uvicorn rewrites the ASGI client address from `X-Forwarded-For` by
  default when the peer is `127.0.0.1` — which in the development compose (host networking) is nginx and
  every other local process. `--no-proxy-headers` in the Dockerfile CMD turns that off, so `TRUSTED_PROXIES`
  is the only place a forwarded address is believed.
- **nginx appends.** `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` makes nginx add the
  address that connected to it. Before, nginx passed a client-supplied `X-Forwarded-For` through untouched,
  so a peer that reached nginx without Traefik could have written any source it liked into the right-most
  position.
- **Refusals are reported, not written one per request.** Every failed login inside the budget still
  writes its `auth.login.failed` row, unchanged; their number is now bounded by the global budget
  (≤ `LOGIN_GLOBAL_RATE_LIMIT` per window). A refused attempt writes an `auth.login.throttled` row only for
  the first refusal of a tier key in a window; later refusals are counted, and the count is carried by the
  next row for that key or by a summary row when the key is swept. So the row count is bounded and the
  number of refused attempts is still in the log. Source-tier rows carry no address (ADR 0026: no caller
  fingerprint); account-tier rows carry the attempted name, exactly as before. The warning log line follows
  the same rule.
- **Lockout balance** (corrected in the review round, R1/R2). The account tier is unchanged:
  someone who knows a username can deny it password login. The global tier adds one more lever:
  300 failures per window from anywhere deny every account password login. Both last **as long as
  the attack**, because a spray is repeated every window — not "for one window", as this brief first
  said. That is the emergency brake working as designed; it costs no KDF work and holds no state per
  attacker request. Requests with an API key are not throttled, so agents, MCP clients and the
  webhook keep working through any lockout; but every password verification is — including the
  current-password check of `PUT /auth/password`, which an API key can reach. An incident that
  suspects a stolen API key is still **not** contained by the limiter; the recovery flow
  (`docs/operations.md`) names both credentials.

## Control

See *Decisions*. In code: `backend/app/rate_limit.py` (`reserve`, `Reservation`, `source_of`,
`trusted_networks`, `_sweep_locked` (called from `reserve`), `key_count`), `backend/app/routers/auth.py::login`.

## Test evidence

Run on 2026-11-25 on an arm64 Mac. The red column is `backend/tests/unit/test_login_budget.py` copied into
a detached worktree of the unchanged production code at `2ca39f0`. So that the HTTP-level tests fail on
the *behaviour* and not on a missing name, that worktree's `Settings` was given the four new fields with
their defaults and `rate_limit` a `key_count()` returning `len(_failures)` — knobs the old limiter does
not read. Tests that call the new pure API (`reserve`, `source_of`, `trusted_networks`) are red there
by its absence, which is recorded as such and is not evidence of anything else.

| Tier | What | Before the control (`2ca39f0` + settings shim) | After |
|---|---|---|---|
| Parallel (ASGI, 40 requests for one account, held together before the KDF) | `TestAParallelBurst::test_the_account_budget_holds_under_a_burst` | **red: 40 × 401, `assert 40 == 10`** — every request passed the check and ran the KDF | 10 × 401, 30 × 429; exactly 10 KDF calls; 10 requests reached the hold point |
| Parallel (regression pin) | `::test_after_the_burst_the_correct_password_is_refused_too` | green — once the old limiter had counted, it refused | green |
| Parallel (64 threads, one barrier) | `TestTheReservation::test_threads_never_get_more_slots_than_the_budget` | red (no `reserve`) | exactly `LOGIN_RATE_LIMIT` slots granted |
| Unit (bounded store) | `TestTheStoreIsBounded::test_expired_names_are_swept_without_being_tried_again` | **red: `assert 21 <= 3`** — twenty expired names still held | swept to ≤ 3 keys |
| Unit (bounded store) | `::test_a_flood_of_new_names_cannot_grow_the_store_past_its_cap` | **red: `assert 60 <= 25`** | ≤ 25 account keys; names 26–60 refused with 429 |
| Unit (regression pin) | `::test_a_full_store_does_not_forget_the_victim` | green — the old store never forgot anything, it only grew | green: the cap refuses, it does not evict |
| ASGI (tiers) | `TestTheTiers::test_a_spray_from_one_source_is_stopped` | **red: `assert 35 == 30`** (35 × 401) | 30 × 401 then 429; 30 KDF calls |
| ASGI (tiers) | `::test_a_spray_from_many_sources_meets_the_global_budget` | **red: `assert 20 == 12`** | 12 × 401 then 429 |
| ASGI (tiers) | `::test_spelling_variants_share_one_account_budget` | **red: `assert 200 == 429`** — `ALICE`, `Alice`, `ａlice` were separate budgets | 429 |
| ASGI (tiers) | `::test_a_success_does_not_reset_the_source_tier` | **red: `assert 401 == 429`** | 429 |
| ASGI (source) | `TestTheSourceBehindAProxy` × 3 — spoofed `X-Forwarded-For` from an untrusted peer; two clients behind a trusted proxy; a spoofed left side of the chain | **red** (`[401]*5`, `(401, 401)`, `[401]*5`) — no source tier | `[401,401,401,429,429]`; `(429, 401)`; `[401,401,401,429,429]` |
| Unit (pure rule) | `TestSourceOf` × 11 — peer without trust, right-most untrusted hop, several header lines, all-trusted chain, no header, garbage hop, IPv6 /64, IPv4-mapped, missing peer, `0.0.0.0/0` and `::/0` refused, malformed entries skipped | red (no API) | green |
| Unit (reservation) | `TestTheReservation` × 6 — in-flight counts, success releases and clears the account only, leaving the block counts as a failure, closing twice counts once, threads (above), `Retry-After` counts down | red (no API) | green |
| ASGI / audit | `TestRefusalsAreReportedNotWrittenOneByOne::test_a_hammered_account_writes_a_bounded_number_of_rows` — 210 attempts | **red: `assert 200 <= 2`** — one throttled row per refusal | 1 throttled row, 10 failed rows |
| ASGI / audit | `::test_the_count_of_refusals_is_not_lost` | **red** (old rows carry no count) | first row (1) + sweep summary (49) = 50 |
| ASGI / audit | `::test_a_source_refusal_row_carries_no_address` | **red: no row** (no source tier) | rows written; no address, no actor |
| Ops | `TestTheSingleWorkerAssumption` — Dockerfile CMD has `--no-proxy-headers` and no `--workers`; deploy compose passes `TRUSTED_PROXIES`; nginx appends `X-Forwarded-For` twice | **red** × 3 | green |
| Ops (regression pins) | `::test_no_compose_file_scales_the_backend` × 2 | green — neither file scales today; pins the re-open trigger | green |
| ASGI/REST (existing) | `test_security_wave.py::TestLoginIsRateLimited` (serial lockout, `Retry-After`, unknown names, window expiry, API keys through a lockout), `test_audit.py` (lockout row with actor and `retry in`; the uniform failed row), `test_logging.py` (`login throttled` line, no secret in the stream), `test_password_kdf.py::TestUniformWork` | green | green, unchanged |
| Container | not applicable — no Taskwarrior path changed; the existing suite runs in `make verify` | — | see Results |
| Frontend | not applicable — no response changed | — | — |

33 of the 37 new tests were red before the control; the 4 green ones are the regression pins named above.

### Review round (2026-11-25)

Eight review findings, each checked against the code before anything was changed. Six are real and
fixed; two are duplicates of others and fixed with them. None was rejected.

| Finding | Verified | Fix | Red before the fix |
|---|---|---|---|
| R1 (important): `PUT /auth/password` ran the current-password KDF outside every budget, with any credential `get_current_user` accepts — an API key included. A stolen key got unlimited password guesses, also while the account's login was locked, and each wrong guess wrote its own `auth.password.changed` row | reproduced (reasoning and test below) | `change_password` reserves through the same `rate_limit.reserve(<authenticated name>, <source>)` before the lookup and the KDF, closes the reservation on every path (`fail` on a wrong current password, `succeed` once it verified), and reports refusals through the same aggregated `auth.login.throttled` rows. A locked account is refused with 429 + `Retry-After` and no KDF work. 429 is not declared in the OpenAPI document for `/auth/login` either; `ops/surfaces/openapi.json` does not move | `TestThePasswordChangeIsBudgeted::test_guesses_through_an_api_key_are_bounded`: **red, `assert 30 == 10`** (30 × 400 through `X-Api-Key`, 30 KDF calls); `::test_a_locked_login_also_locks_the_password_check`: **red, `assert 200 == 429`** — the password was changed with the right current one while login was locked. `::test_the_right_current_password_still_changes_it`: green (regression pin) |
| R2/R5/R6 (important, one root): with `TRUSTED_PROXIES` empty — the state the merge deploy ships in — every internet login arrives from nginx's address, so the source tier was one budget of 30 per window for everybody: one client spraying ~6 names a minute denied password login to every account, indefinitely. And the global brake (100) was low enough to be the *normal* trigger of the same denial from four addresses | reproduced | (a) **No source tier for a proxy-shaped peer nobody declared.** With `TRUSTED_PROXIES` empty, a peer in loopback, RFC 1918, link-local or IPv6 ULA space — the addresses a reverse proxy on this host or container network has — gets no source key (`source_of` returns `None`); the account and global tiers still apply. A boot `WARNING` says so until the operator sets `TRUSTED_PROXIES`. A public peer, and any peer once `TRUSTED_PROXIES` is set, is counted as before. (b) **The global brake is sized from the KDF, not from the account budget:** a failed verification measured 0.26 s of event-loop time on the development machine (`check_password` runs on the event loop), so 300 failures per 300 s window is about a quarter of it; the default is now 300, not 100. (c) The docs, the ledger and this brief now say the denial **lasts as long as the attack**, with the numbers, and the default-config exposure is an accepted residual risk with its trigger | `TestAnUndeclaredProxyIsNotOneSourceForEveryone::test_a_spray_through_the_proxy_does_not_lock_out_a_bystander`: **red, `assert 429 == 200`** (peer `172.18.0.7`, 35 names, then alice with her password); `::test_four_full_sources_do_not_trip_the_global_brake`: **red, `assert 429 == 200`** (4 × 30 failures tripped the global 100); `::test_a_proxy_shaped_peer_without_trust_has_no_source_key` × 6: **red** (the peer came back as the key); `test_the_boot_says_when_the_source_tier_is_off_behind_a_proxy[""]`: **red, `assert False is True`** (no warning). Green pins: the global brake still holds through the proxy, a public peer is still counted, a private peer is counted once proxies are declared, no warning once they are |
| R3/R7 (minor, one root): the re-open trigger read only the CMD for `--workers`; an `ENV WEB_CONCURRENCY=…`, an `ENTRYPOINT` or a gunicorn wrapper elsewhere in the Dockerfile would start several workers unseen | correct: uvicorn 0.53's `--workers` defaults to `$WEB_CONCURRENCY` | CMD pins `"--workers", "1"` (an explicit flag overrides the variable); the test asserts that exact pair in the CMD, and across the **whole** Dockerfile: no `WEB_CONCURRENCY`, no `ENTRYPOINT`, no `gunicorn`, one `CMD`. Ledger and docs narrowed to what the test checks | `TestTheSingleWorkerPinIsWholeFile::test_the_cmd_pins_one_worker` and the amended `TestTheSingleWorkerAssumption::test_the_image_runs_one_worker_and_trusts_no_proxy_header_itself`: **red** (no `"--workers", "1"` in the CMD); `::test_nothing_else_in_the_dockerfile_can_start_more_workers`: green (regression pin — nothing sets it today) |
| R4 (minor): `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_SECONDS`, `LOGIN_SOURCE_RATE_LIMIT`, `LOGIN_GLOBAL_RATE_LIMIT`, `LOGIN_RATE_MAX_KEYS` never reached the container — both compose files list `environment:` explicitly and have no `env_file` | reproduced (`grep`) | all five passed through in both files with the `Settings` defaults; a test pins every line and that each compose default equals the `Settings` default (an empty value would not parse as an int and the backend would not boot) | `test_every_login_budget_variable_reaches_the_container` × 10 (5 variables × 2 files): **red**, e.g. `ops/deploy/docker-compose.yml does not pass LOGIN_RATE_LIMIT` |
| R8 (minor): *Control* named a `sweep` that does not exist | correct | now `_sweep_locked` (called from `reserve`) | — (documentation) |

The red column of this round was observed on the working tree with the tests applied before the control
(the code of `a747f4b`): 21 of the 26 new tests red, 5 regression pins green; the boot-warning test was
written after the warning and observed red by restoring `a747f4b`'s `main.py` (1 red, 1 pin green). After
the control: all green. Rule, budget and waiver files are untouched; `rules/ledger.yaml`'s `RISK-SEC-003`
statement and trigger are corrected, not downgraded, and need owner approval (`RISK-GOV-001`).

**What R2's fix trades.** Without `TRUSTED_PROXIES` the source tier stops a spray only from a peer that
is not proxy-shaped — in the shipped topology, from nobody, because everyone arrives through nginx. The
spray is then bounded by the global brake (300 failures per window), not by a per-source budget of 30.
That is a weaker brute-force bound for the days between the deploy and the operator setting
`TRUSTED_PROXIES`, chosen over a deploy that hands any single client a cheap switch for every account's
password login. Setting `TRUSTED_PROXIES` on the host **before** merging is now the recommended rollout
order (`docs/operations.md`, *The login budget*), not an item for after the deploy; the code default is safe
in either order. The *Delivery Pattern* row's "at least as safely" holds for confidentiality; for
availability the previous deploy had no cross-account lockout at all, and this one has the global brake —
stated, not hidden.

### Second review round (2026-11-25)

Two findings, both checked against the code of `7a654b8` before anything was changed. Both are real.

| Finding | Verified | Fix | Red before the fix |
|---|---|---|---|
| R9 (important): once `TRUSTED_PROXIES` is set, a proxy-shaped peer that is **not** on the list counted as a source in its own right. The documented procedure lists the Traefik and nginx container addresses, which can change on recreate — and every merge recreates the frontend. nginx back at a new address made every client one source of 30: any one client locks every account out of password login, the R2 failure mode, silently (the boot warning fires only when the list is empty) | reproduced: `source_of("172.18.0.8", ["198.51.100.1, 172.18.0.2"], <.2,.7>)` and the same with `203.0.113.9` both give `172.18.0.8`; `ops/deploy/docker-compose.yml` pins no address | **Fail safe on drift.** With `TRUSTED_PROXIES` set, a peer that is proxy-shaped, not trusted, and sends `X-Forwarded-For` gets no source key (`source_of` returns `None`), exactly like the undeclared-proxy case; the account and global tiers still apply. A proxy-shaped peer *without* the header is one local client and is still counted as itself. The backend logs a `WARNING` (`login request from an undeclared proxy`) at most once per window, without the address. `docs/operations.md` step 1 says what drift does and how to see it | `TestAProxyThatMovedIsNotOneSourceForEveryone::test_a_recreated_nginx_does_not_lock_out_a_bystander` (ASGI, 35 wrong logins through nginx at a new address, then a bystander) and `::test_a_moved_proxy_has_no_source_key` (pure rule), `::test_the_drift_is_logged_once_per_window_without_the_address` |
| R10 (important): the account tier could be reset by a different account. The key is NFKC+casefold of the name and a success cleared the whole bucket, but registration only requires NFC and `users.username` is case-sensitive, so `Alice` and `alice` can both exist. The owner of `alice` logs in after every 9 guesses against `Alice` and wipes the count: 45 guesses per window instead of 10 | reproduced: `username_problem("Alice")` and `username_problem("alice")` both `None`; `Reservation._close` clears `bucket.failures` for whichever name succeeded | **A success clears only the failures recorded under its own exact name.** Each account-tier failure carries a 16-byte digest of the exact name it was attempted under (the lookup is `WHERE username = ?`, BINARY, so a success proves exactly that string); `succeed` removes those and leaves every other spelling's failures to expire. The tier still shares one budget across spellings | `TestASuccessClearsOnlyItsOwnSpelling::test_another_spelling_cannot_wipe_the_count` (limiter) and `::test_a_second_account_cannot_reset_the_victims_budget` (ASGI, `Alice` and `alice` both registered) |

The red column of this round was observed on the working tree with the tests applied before the control
(the code of `7a654b8`): 5 of the 8 new tests red — `test_a_recreated_nginx_does_not_lock_out_a_bystander`
**`assert 429 == 200`**, `test_a_moved_proxy_has_no_source_key` **`'172.18.0.8' is None`**,
`test_the_drift_is_logged_once_per_window_without_the_address` red by absence (`rate_limit.logger`),
`test_another_spelling_cannot_wipe_the_count` (the 11th `Alice` attempt was granted),
`test_a_second_account_cannot_reset_the_victims_budget` **`assert 45 <= 10`**; 3 regression pins green
(the declared proxy still yields the client, a public peer with the header is counted as itself, the same
spelling still clears its own failures). After the control: all green, with the existing suite
(`test_login_budget.py`, `test_security_wave.py`, `test_audit.py`, `test_logging.py`,
`test_password_kdf.py`: 268 passed). `test_once_proxies_are_declared_a_private_peer_is_counted` is kept
unchanged: it sends no `X-Forwarded-For`, and a local peer without a forwarded chain is one client.
Rollback: no stored data changed shape — the limiter is in memory; reverting restores the previous rule.

Not done in this round, recorded under *Deferred*: refusing a **new registration** whose canonical key
(NFKC + casefold) collides with an existing account. It would close the confusable-name class at its
source, but it changes `POST /auth/register`'s behaviour (a 409/422 for names that register today), which
is a public-surface change for its own brief; the limiter fix above does not depend on it. Existing
colliding pairs on the host are an operator item (query in *Deferred*).

## Results

- REV-003's closing criterion (plan §5: pre-reservation, parallel budget and bounded store tested) is met
  and proved by tests observed red on the old code and green on the new; they run in every `make check`.
- Plan M3.2 acceptance: the parallel burst stays within the account budget and starts no KDF work after it
  (exactly 10 of 40); the key count stays under the cap; the serial suite and the uniform 401 are green.
- `RISK-SEC-003` is **narrowed, not removed**: the in-process, per-worker limitation and the lockout trade
  remain and are restated in `rules/ledger.yaml`; its re-open trigger is now a test.
- Public surfaces: four additive env vars documented in README (`RULE-SURF-002` green); REST, MCP, DB, SPA
  snapshots unchanged (`make surfaces`: no drift).
- Rollback: reverting restores the old limiter; no stored data changed shape, and the previous image ignores
  the new variables. `--no-proxy-headers` and the nginx header revert with it.

- `make check` on `158da0d`: **GREEN** (37 s of 180 s).
- `make verify` on `158da0d` in a clean, bootstrapped detached worktree: **RED** (266 s of 600 s) —
  `RULE-GATE-002`: the `OPS-002-fstring` arm of `tools/fixtures/negative.sh` anchors its injected
  credential-logging line on `rate_limit.clear(body.username)`, which this change removed, so the arm
  could not run. The rule itself did not change; the fixture was re-anchored on the new success line
  (`attempt.succeed()`), injecting the same f-string with the password in scope, in `c51be52`. The fixture
  file is gate configuration, so this needs owner approval (`RISK-GOV-001`: not independent).
- `make check` on `c51be52`: red once (run before `make fix` had rebuilt the index after the fixture edit;
  the failing line was not captured), then **GREEN** (37 s of 180 s).
- `make verify` on `c51be52` in a clean, bootstrapped detached worktree: **GREEN** (271 s of 600 s) — unit
  1033 passed, frontend 767 passed, 57 fixture arms passed, 0 failed; 47 of 50 executable rules proven able
  to fail. The **container tier was skipped** on this arm64 host (`RISK-TEST-001`: no arm64 archlinux
  image); it runs in CI only and was not observed here. No Taskwarrior path changed in this package.
- Review round, `make check` on `7113b4d`: **GREEN** (39 s of 180 s).
- Review round, `make verify` on `7113b4d` in a clean, bootstrapped detached worktree: **GREEN** (274 s of
  600 s) — unit 1061 passed, frontend 767 passed, 57 fixture arms passed, 0 failed; 47 of 50 executable
  rules proven able to fail. The **container tier was skipped** on this arm64 host (`RISK-TEST-001`); the
  Dockerfile's CMD changed (`--workers 1`), so the image was **not** built or started here — CI's container
  tier is the first run of it.

### Deferred, with trigger

- **Production `TRUSTED_PROXIES`** — operator, on the host (plan M0 class: production facts this repository
  cannot see). **Recommended before merging this branch** (review round, R2). Until set, the source tier is
  off behind nginx (a boot `WARNING` says so) and a spray is bounded by the account and global tiers only.
  Procedure in `docs/operations.md`, *The login budget*. Trigger: before the merge deploy; at the latest,
  the first `TRUSTED_PROXIES is not set` warning in the production log.
- **The global brake's size on the production CPU** — 300 was derived from 0.26 s per failed verification
  measured on the development machine; the production host was not measured (`RISK-TEST-003`: nothing
  measures KDF latency). Trigger: the first global-tier `auth.login.throttled` row, or a KDF parameter
  change.
- **Traefik's forwarded-header configuration** — confirm on the host that Traefik overwrites rather than
  forwards a client's `X-Forwarded-For`. Not visible here (`RISK-OPS-002`).
- **A shared limiter** — only when `TestTheSingleWorkerAssumption` goes red (`RISK-SEC-003`).
- **Canonical-collision refusal at registration** (second review round, R10) — refuse a new username
  whose NFKC + casefold key equals an existing account's. A behaviour change of `POST /auth/register`
  (the only caller of `username_problem`), so its own brief; the limiter no longer depends on it. Operator item until
  then: list existing pairs on the host with
  `sqlite3 users.db "SELECT lower(username), group_concat(username) FROM users GROUP BY lower(username) HAVING count(*) > 1;"`
  (ASCII case only; a full NFKC check needs Python). Trigger: the next change to `username_problem`, or
  any pair found.
- **Pinning the proxy addresses** (second review round, R9, option 2) — a fixed `ipv4_address` for the
  frontend on a fixed-subnet network, or resolving `TRUSTED_PROXIES` by service name. `traefik-public` is
  an external network this repository does not define, so the subnet is a host fact (plan M0). Until
  then, drift fails safe (source tier off, `WARNING`). Trigger: the first `undeclared proxy` warning in
  the production log.
- **Audit retention and size budget** — M8 (`RISK-OPS-006`); this change bounds the *rate* of login rows
  (≤ `LOGIN_GLOBAL_RATE_LIMIT` failed rows plus a few throttled rows per window), not the file's total size.
