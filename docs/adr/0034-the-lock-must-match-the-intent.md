# ADR 0034 — The lock must match the intent, not merely exist

- **Date:** 2026-09-19
- **Status:** Accepted
- **Scope:** `tools`, `rules`, `docs`

## Context

The backend declares its direct dependencies twice. `backend/requirements.txt` and
`backend/requirements-dev.txt` are the **intent** — nine and six exact pins. `backend/requirements.lock`
and `backend/requirements-dev.lock` are the **closure**, compiled from the intent by `./run lock`, with
every transitive dependency and its artefact hashes. The images install the lock with
`--require-hashes`, and never the intent.

`RULE-DEP-004` checks that each lock exists and carries hashes. It was read — in
[`docs/task-interface.md`](../task-interface.md), in this programme's own briefs, and by the maintainer —
as checking that the lock *is the intent, compiled*. It never did. Nothing compared the two files.

Found on 2026-09-18 while checking Dependabot #26, which bumped `fastapi-mcp` in `requirements.txt` and
left the lock alone. It passed `verify`. Merged, it would have changed a line of text and nothing in the
image — the version the reviewer approved would not have been the version that shipped. Every Dependabot
pip pull request takes that shape, and four were open (#24, #25, #28, #30).

It is the same defect as [ADR 0033](0033-the-mcp-server-nobody-could-connect-to.md) in a smaller form:
an artefact verified by its form rather than by the claim people read it as making.

## Decision

A new rule, `RULE-DEP-005`, in the existing supply-chain check (`tools/checks/pinning.py`, reported by
`tools/checks/supply-chain.sh`). For each lock and the intent files `tools/lock.sh` compiles it from:

1. every intent line MUST be an exact `==` pin — a range cannot be compared, and the intent is
   documented as exact;
2. every declared dependency MUST appear in the lock, at exactly the declared version;
3. a lock MUST NOT still install, as a direct dependency (`# via -r <intent>`), a package no intent file
   declares any more.

Names are compared after PEP 503 normalisation. The fix is `./run lock`.

It is a separate id rather than a widening of `RULE-DEP-004` because it is a different claim — *these two
files agree*, not *this file is well-formed* — and the ledger's value is that each id states one claim
that its fixture proves.

### Alternatives considered

- **Recompile in the gate and diff.** The strongest form: it would also catch a hand-edited transitive.
  Rejected because `uv pip compile` resolves against the live index — the gate would need network access
  and its verdict would change with the calendar, which is the failure `RULE-DEP-004` exists to prevent.
- **Have Dependabot update the lock.** It cannot regenerate `uv pip compile --generate-hashes` output for
  a requirements file. The rule does not depend on that changing: a Dependabot pip PR now goes red, and
  the remedy is `./run lock` on its branch.

## Consequences

- A bump to the intent alone fails `verify` with the file, line, declared version and locked version.
- The open Dependabot pip PRs will go red on their next rebase. That is the rule working.
- **What it does not hold:** transitive versions are still whatever the last `./run lock` resolved; a
  hand edit to a transitive line of a lock is not detected unless it also breaks the hash install. The
  gap recorded under §10 of [`AGENTS.md`](../../AGENTS.md) ("transitive dependencies are not pinned as a
  whole") is unchanged by this rule.
