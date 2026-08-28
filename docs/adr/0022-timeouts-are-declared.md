# ADR 0022 — A timeout is declared at the call site, or the gate says so

- **Date:** 2026-08-28
- **Status:** Accepted
- **Scope:** `ops`, `backend`

## Context

The application makes exactly one blocking outward call. `task_runner._run` shells out to the
Taskwarrior binary, and it passes `timeout=10`.

Nothing holds that argument in place. It is one keyword on one line, in a function that has
been edited in three of the last four steps, and deleting it changes no test, no type, no lint
finding and no observable behaviour on a developer machine — where `task` always returns in
milliseconds. The gate would stay green all the way to production.

What that costs is not a slow page. Taskwarrior is the engine behind every list this
application renders, so a `task` invocation that never returns is a worker that does not come
back. Enough of them and the service is down, with nothing in any log to explain it: nothing
raised, nothing errored, every request simply stopped ending. That is the failure mode this
step exists to make impossible to reintroduce by accident.

The plan named this rule in Step 15 (`docs/plan/phase-0-2.md`, "Operability and the minimal
threat model") and it was one of two Step 15 items that earlier versions of the session
handoff had silently dropped.

## Decision

**`RULE-OPS-001`: every blocking outward call the serving application makes — process
execution and network egress — declares a timeout at the call site.**

The check is an AST scan over tracked Python under `backend/app/`
([`tools/checks/timeouts.py`](../../tools/checks/timeouts.py)). It resolves import aliases
before matching, so `import subprocess as sp` and `from subprocess import run as r` are not
holes.

### At the call site, and readable there

Three shapes are refused beyond the ordinary missing argument:

* **`timeout=None`** — the absence of a timeout, written out. Deliberate enough to deserve a
  reviewer.
* **keywords through `**kwargs`** — a bound that cannot be read at the call site cannot be
  reviewed at the call site.
* **`subprocess.Popen`** — it accepts no timeout argument at all. The waiting moves to
  `.communicate()`, somewhere else in the file or in another file entirely, which is exactly
  the indirection the rule exists to refuse. The application has one subprocess call and no
  reason to want a handle.

This is stricter than "a timeout exists somewhere on this path", and deliberately so. The
looser property is the one that cannot be checked, and a rule that cannot be checked is
advice.

### Scoped to the serving application

`backend/app/` only. Repository tooling under `tools/` also shells out — four files run
`git ls-files` — but the gate has its own runtime budget enforced by `RULE-GATE-001`, so a
hung tooling subprocess is already bounded and already fails something. Extending the rule
there would add standing exceptions without adding a control, and standing exceptions teach
people a rule is noise.

### The egress half is proven even though there is no egress

The application makes no network calls today. A rule whose network arm had never been observed
failing would be a claim, not a control, so the fixture suite introduces the first HTTP client
the way someone actually would — `httpx.post(url, json=...)` in a service module — and
requires the gate to catch it. Both arms of the rule now go red on demand
([`tools/fixtures/negative.sh`](../../tools/fixtures/negative.sh)).

## Consequences

The rule costs nothing to satisfy today: the only call it governs already complies. That is
the intended shape of it. It is not repairing a defect, it is holding a property that is
currently true and is one careless edit from not being.

**What it does not do:** check that the value is sensible. `timeout=86400` passes and helps
nobody, as does a timeout longer than the reverse proxy's own read timeout — which converts a
bounded wait into a 504 with a worker still blocked behind it. The right value depends on what
the callee does, what the caller promised, and what sits in front of both, none of which a
scanner can read. The check also knows only the call shapes it lists, so a blocking call
through a library it has not been taught is invisible to it. Both limits are recorded as
`RISK-OPS-003` rather than implied, with a re-open trigger on the first real egress client.

This is the first rule in the `OPS` family, and it establishes
[`docs/operations.md#timeouts`](../operations.md#timeouts) as the section the family's rules
point at. Step 15's logging rule follows there.
