# ADR 0003 — Formatter, linter and type checker per ecosystem

- **Date:** 2026-08-04
- **Status:** Accepted
- **Scope:** `backend`, `frontend`

## Context

Phase 0 found no formatter, linter, type checker or test runner in either ecosystem. The first pass had to
produce a gate that is green and enforced — not the largest rule set that can be switched on. A lint gate
that lands red, or that lands with a thousand cosmetic findings, teaches contributors to bypass it.

## Decision

**Backend — `ruff` (format + lint) and `mypy`.** One binary covers formatting, import sorting and linting,
so there is no formatter/linter disagreement to arbitrate. The rule selection is deliberately modest:
`E`, `F`, `I`, `UP`, `B`, `S` (flake8-bandit), `T20`. `E501` is ignored because line length is the
formatter's job.

`S` earns its place immediately: it independently surfaced SEC-1 (the default JWT secret), SEC-3 (untrusted
input reaching a subprocess) and the silent migration `except: pass` — turning three prose findings from the
Phase 0 report into gate findings with waiver entries and expiry dates.

`B008` is disabled for router modules: it forbids function calls in argument defaults, but `Depends(...)` in
a default *is* FastAPI's dependency injection, not a mutable-default bug.

mypy runs with `check_untyped_defs`, which is stricter than the obvious starting point. It is worth it — it
found unchecked `Row | None` indexing in two request handlers, a latent 500 that no test here would catch.

**Frontend — `eslint` with `eslint-plugin-vue` at `flat/essential`.**

`flat/recommended` was tried first and produced **1100 findings: 2 errors and 1098 warnings**, of which
1098 were template formatting opinions — attribute line breaks, attribute ordering, indentation, self-closing
tags. Auto-fixing would have rewritten all 18 `.vue` files immediately before Steps 3 and 4 add tests and
touch the same files, for no defect-prevention value.

`flat/essential` keeps the correctness rules — misused directives, duplicate keys, invalid `v-for`, unused
bindings — and drops the cosmetics. It found 2 real defects: a dead `matchMedia` probe left behind when the
app stopped following the system colour scheme (`cb707b4`), and an unused `watch` import.

**No frontend formatter.** Prettier would reintroduce the same 18-file rewrite through a different door.

## Alternatives considered

- **black + flake8 + isort** — three tools, three configs, and a well-known formatter/linter disagreement to
  suppress. `ruff` replaces all three and runs faster.
- **`pyright` instead of `mypy`** — good, but adds a Node dependency to the backend toolchain, and the
  backend should be verifiable without Node.
- **Widening ruff's selection now (`ALL`, or adding `ANN`, `PTH`, `RET`)** — rejected: a large findings
  backlog on day one is indistinguishable from a broken gate.
- **`vue/recommended` plus a one-off formatting commit** — rejected on the numbers above. Recorded as
  reversible: adopting a frontend formatter and widening to `vue/recommended` is a single later change whose
  whole cost is one mechanical diff, best scheduled when it does not collide with test work.

## Consequences

- `make fix` applies every deterministic repair. Gate messages for `RULE-FMT-001`, `RULE-LINT-001` and
  `RULE-LINT-002` name it, so a formatting failure never costs thinking.
- Dev tooling is pinned exactly in `backend/requirements-dev.txt`. A gate whose tools float is a gate whose
  verdict changes without anyone changing code.
- Suppressions are not free: every `noqa` and `type: ignore` must correspond to an entry in
  `rules/waivers.yaml`, either a `scheduled_remediation` with an expiry or a reviewed
  `justified_suppression`. Step 9 makes that correspondence a gate check.
- **`npm install` reported 5 pre-existing vulnerabilities (1 moderate, 4 high)** in the frontend dependency
  tree. Not addressed here — dependency auditing and the license policy are Step 14. Recorded so it is not
  discovered again as if new.

## Related

- ADR 0001 (task interface), ADR 0002 (interpreter provisioning)
- `rules/waivers.yaml` — WAIVER-SEC-001, WAIVER-SEC-002, WAIVER-OPS-001, WAIVER-TYPE-001
