# ADR 0023 — A credential does not reach a log line, and the source says so

- **Date:** 2026-08-28
- **Status:** Accepted
- **Scope:** `ops`, `backend`

## Context

The serving application logs nothing. There is no `import logging`, no `getLogger`, and no `print()`
anywhere under `backend/app/`; what production emits today is uvicorn's own default output and not a single
line this repository wrote. Step 15a is about to change that.

Everything a logger would naturally want to log is next to something that must never be logged. The login
handler holds `body.password` two lines from the decision worth recording. The authentication dependency
holds `x_api_key` and `credentials.credentials` — the raw bearer string, which `SHIM-SEC-006` also accepts
as an API key — in the same function as the outcome anyone would want in an audit trail. Key regeneration
holds `new_key` in the clear because it has to return it. Token minting and decoding sit either side of
`settings.jwt_secret`. There is no part of the credential surface that is far away from the place a log line
belongs.

And a log line is the one place a credential is copied *deliberately*: written to disk, shipped to whatever
aggregates the output, and retained for as long as the policy says, which is longer than anyone remembers.
Nothing raises, nothing errors, no test goes red, and the disclosure is invisible until somebody reads the
file. By then the remedy is rotation, not deletion — the same remedy `RULE-DEP-003` exists for, arrived at
by a different route.

The plan named this in Step 15 (`docs/plan/phase-0-2.md`, "Operability and the minimal threat model") as
"structured logging plus an executable no-secrets-in-logs rule". This record covers the rule half only. The
log format and transport — whether uvicorn's access logger is replaced through `--log-config`, or a JSON
application logger runs alongside it — is still open, and deliberately not decided here.

## Decision

**`RULE-OPS-002`: no credential may reach a log line.** The serving application does not pass a
credential-bearing expression to a logging call — in the message, in an interpolation, or in the structured
fields.

The check is an AST scan over tracked Python under `backend/app/`
([`tools/checks/log_secrets.py`](../../tools/checks/log_secrets.py)), wrapped by
[`tools/checks/log-secrets.sh`](../../tools/checks/log-secrets.sh), in the same shape as
[`RULE-OPS-001`'s scanner](../../tools/checks/timeouts.py). It runs in both `check` and `verify`.

### A static source scan, not an output filter

The obvious alternative is a redacting formatter: scrub the stream on the way out. It was rejected for three
reasons, in increasing order of weight.

It fixes the symptom at the last possible moment, so the credential has already been formatted into a string
and passed through several frames before anything looks at it, and every path that bypasses the formatter —
an exception traceback, a third-party logger, a `print()` — bypasses the control with it.

It is a runtime property, so the only way to know it works is to observe output, which means the rule can
only fail *after* someone has written the bad line and run the code that reaches it. A gate that fails at
review time is worth more than one that fails in staging.

And decisively: **a filter is coupled to the transport, and the transport is not decided yet.** A rule that
read emitted lines would have to be rewritten the day Step 15a chooses between a replaced uvicorn access
logger and a JSON application logger — and a rule rewritten under the pressure of shipping something else is
a rule that gets relaxed. Reading source is invariant to that choice, so this rule can land *first*, and the
logging module arrives into a repository that already refuses the mistake.

### Before the module, not after

This is the whole reason for the sequencing. The property is currently true and free: there is nothing to
log with, so there is nothing to log a credential from. It becomes losable in exactly one commit — the one
that adds the logger — and that commit is large, structural, and reviewed for whether the logging *works*.
Expecting the reviewer of a hundred lines of logging plumbing to also notice one interpolated field is
expecting the review that never happens. Landing the rule first converts that from vigilance into a build
failure, at a moment when it costs nothing to satisfy.

It is the same shape as `RULE-OPS-001` in [ADR 0022](0022-timeouts-are-declared.md): a rule that repairs no
defect, holds a property already true, and exists for the edit that has not been written yet.

### What counts as a logging call, and what counts as a credential

Both halves are deliberately generous.

A **logging call** is the `logging.*` module functions, any name assigned from `getLogger` or `getChild`,
a `getLogger(...)` call used inline and never bound to a name, and any method in
`debug/info/warning/error/exception/critical/log` on a receiver named like a logger (`logger`, `log`,
`self.logger`, `audit_log`) — plus `print()`, because in a container stdout *is* the log stream regardless
of what the caller believes. Import aliases are resolved first, so `import logging as lg` and
`from logging import getLogger as gl` are not holes; a rename must not be a way through.

The inline form was not in the first draft, and the negative fixture is what found that: the fixture wrote
`logging.getLogger(__name__).info("jwt secret is %s", secret)` — the shape a first logging line most often
takes — and the check stayed green. This is the argument for `RULE-GATE-002` in one paragraph. A rule
nobody has watched fail is a claim, and this one would have shipped with its most likely case unhandled.

A **credential** is a name this codebase actually uses, not a generic word list: `password`,
`current_password`, `new_password`, `hashed`, `jwt_secret`, `token`, `access_token`, `credentials`,
`api_key`, `x_api_key`, `new_key`. Names are matched by segment, so `api_key` is a credential and the bare
`key` — a column in `site_settings` and a dict key everywhere — is not. The scan walks the entire argument
subtree, which means f-strings, `%` interpolation, `.format()` and the `extra={...}` dict are covered by one
pass rather than four special cases. `extra=locals()` is refused outright: a payload that cannot be read at
the call site cannot be reviewed there, and in a request handler the locals are precisely where the password
is. That is the same judgement `RULE-OPS-001` makes about keywords arriving through `**kwargs`.

### One greppable escape hatch

`# log-secrets: allow` anywhere in the logging statement, with a reason — the same idiom
[`secret_scan.py`](../../tools/checks/secret_scan.py) uses for `secret-scan: allow`. A single fixed string
means every standing exemption in the repository is one `grep` away, which is what makes an exemption a
decision rather than a disappearance. There are none today.

## Consequences

`check` and `verify` gain a `log-secrets` step, and the conformance suite grows by two proven-failable
rules: the two arms constructed in [`tools/fixtures/negative.sh`](../../tools/fixtures/negative.sh) are the
resolved JWT secret written to a logger, and a password and an API key interpolated into an f-string. The
repository has no logging to break, so both fixtures inject the violating code themselves — which is also
the honest way to prove a rule about code that does not exist yet.

Step 15a's logging module now has a constraint to build against instead of a convention to remember. The
first person to write `logger.info(f"login {body.password}")` learns about it from the gate, in the message
that points at [`docs/operations.md#no-secrets-in-logs`](../operations.md#no-secrets-in-logs).

**What it does not do.** It matches credentials by name, so it is blind to the same value under a neutral
one: logging `body`, `row` or a request object discloses the password with nothing to match on, as does a
credential assembled at runtime or returned by a function whose name does not say so. It reads only
`backend/app/`, so a credential logged by a library, by uvicorn's own access logger, or carried in an
exception traceback is outside it entirely. And it recognises loggers by import, by assignment and by
naming convention — a logger reached some other way is a hole. These are the same limits, of the same
class, that `RISK-DEP-002` records for the pattern-based secret scan, and they are recorded here as
`RISK-OPS-004` rather than left for a reader to discover, with a re-open trigger on the first credential
found in a production log that the scan did not report.

This is the second rule in the `OPS` family and it points at the same anchor the first established,
[`docs/operations.md`](../operations.md) — one page an operator reads, not one section per rule.
