# ADR 0029 — The first commit of a new unit is generated, because remembering forty-three rules is not a plan

- **Date:** 2026-08-29
- **Status:** Accepted
- **Scope:** `ops`, `backend`, `frontend`

## Context

[`docs/plan/phase-0-2.md`](../plan/phase-0-2.md)'s Step 16b asks for one command that emits a router, a
service, models, both test tiers and the unit registration, "so a new unit **inherits every applicable
boundary rule from its first commit**", with the acceptance criterion stated as *one command, green with
zero manual edits*.

That sentence was written when this repository had a handful of rules. It now has forty-three in
[`rules/ledger.yaml`](../../rules/ledger.yaml) and forty-six fixtures proving them able to fail. Adding one
backend feature by hand means being right about all of the following, in one commit:

- a unit registration in [`architecture.toml`](../../architecture.toml) with paths, owner, classification and
  an allowed-edge list that does not accidentally hand the new unit the Taskwarrior door (`RULE-ARCH-001`);
- a guard declaration in [`rules/route-guards.toml`](../../rules/route-guards.toml) for every route added
  (`RULE-SEC-001`);
- enough tests, in both tiers, that the new module does not drag total coverage toward the 90% floor
  (`RULE-TEST-003`) — the failure that is most annoying because it fires on an axis unrelated to the change;
- regenerated public-surface snapshots, because a new route moves both the served OpenAPI schema and the
  runtime-observed MCP tool list (`RULE-SURF-001`);
- the two counted claims in [`AGENTS.md`](../../AGENTS.md), which `RULE-DOC-001` checks against the index;
- a fan-in baseline that a guarded route has just pushed over (`RULE-ARCH-003`);
- formatting, lint and types;
- and a `git add` early enough that the index — which reads `git ls-files` — can see the files at all.

Every one of those is a place to be right, and they are not equally loud. Forgetting the formatter is
noticed in four seconds. Forgetting the guard declaration is the interesting one: without `RULE-SEC-001` the
route would work, it would just work for everybody.

The failure mode of a scaffold generator is equally well known: a template full of `TODO` and `pass` that
compiles, satisfies nothing, and leaves the contributor to do the same forty-three things by hand while
believing the tool did them. A scaffold whose output is not itself green is worse than no scaffold.

## Decision

### `./run scaffold` emits a working, guarded, tested, snapshotted slice — not a template

`KIND=backend-feature NAME=x` writes `backend/app/routers/x.py` with one real `GET /x` guarded by
`get_current_user`, `backend/app/services/x_service.py`, `backend/app/x_models.py`, and a test in each tier.
`KIND=frontend-feature` writes the view, its pure logic module and a vitest file. Nothing in the output is a
placeholder that fails to run; what is placeholder is the *content* — `summarise()` returns a shape rather
than data — and the tests pin that shape, so the first real change to the feature has to edit a test, in a
diff, where somebody can see it.

The templates are written to read like the code beside them: module docstrings that say why the file exists
rather than what it contains, the repository's own naming, and the same comment density. Code that reads as
generated is code nobody maintains, and the first thing a contributor does with an obviously generated file
is stop reading it.

### The new unit is a vertical slice, declared ahead of the layer units

The generated backend unit is `be/feature/<name>` and it owns all three files. Its edge list grants
`be/services`, `be/adapters/db`, `be/di` and `be/leaves`, and **withholds `be/adapters/task`** — so a
generated feature cannot reach the Taskwarrior subprocess except through `be/services`, where the validation
lives. That is the "inherits every applicable boundary rule" of the plan sentence made concrete: the rule
the new unit inherits is a *narrower* one than the layer it enters at.

Two consequences are accepted rather than hidden:

1. **Position in [`architecture.toml`](../../architecture.toml) is load-bearing.** Ownership resolves to the
   first unit whose path patterns match, and `be/routers` claims `backend/app/routers/**` by glob. So
   generated units are declared at the top of the units section, between markers, and the file says why. The
   alternative — narrowing `be/routers` to an explicit file list — was rejected: it would silently unown the
   next hand-written router, and an unowned file is not a gate failure, it is just a file nobody owns.
2. **The router/service split inside the slice is not enforced.** Both files are in one unit, so the import
   between them is internal and the boundary checker has nothing to say about it. Splitting the slice into
   two units per feature would restore that, at the cost of two unit blocks, two edge blocks and two entries
   in every `to` list per feature. The split is held by the module docstrings and by review, and it is
   written into the generated unit's own `note` so that the next reader is not misled about what is checked.

### The generator regenerates the public-surface snapshots itself

The alternative was to print "now run `./run surfaces --update`". It was rejected on the acceptance criterion
— *zero manual edits* — but it would have been the wrong call anyway. `RULE-SURF-001` exists to make a
surface change **visible and deliberate**, and what makes it visible is the checked-in diff a human commits,
not the keystroke that produced it. The scaffold leaves the diff; the operator still reads it and still
decides. The same reasoning covers the two counted claims in [`AGENTS.md`](../../AGENTS.md): the numbers are
derived facts about the index, and a generator that adds a route and leaves the count wrong has produced a
red tree and called it a scaffold.

### It raises a fan-in baseline, and says so in the file

Every guarded route imports `get_current_user`, so every backend feature is one more dependent on
`backend/app/dependencies.py` and `RULE-ARCH-003` fires. Two ways out were available.

Allowlisting `dependencies.py` in [`ops/structure-baseline.toml`](../../ops/structure-baseline.toml) alongside
`models.py` and `config.py` would end the problem permanently — and that is exactly what is wrong with it. It
would drop the signal for *every* future dependent, including the ones that are not a route and are worth
looking at.

So the generator raises the number by the observed amount and writes a dated line above it naming the command
that moved it. `RULE-ARCH-003` forbids a hub growing **silently**; this is the opposite of silent. It is a
ratchet raised by a generator, which is a real weakening — ten scaffolds raise it ten times, each one
reviewable and each one likely waved through — and that is the sharpest trade-off in this change. It is
recorded here rather than smoothed over.

### No new gate rule

Nothing here needs one. The generator's whole job is to satisfy rules that already exist, and its acceptance
criterion is that `./run verify` passes — which is itself the test. Inventing a `RULE-SCAFFOLD-00x` so that
this document could cite one would produce a rule whose failure nobody has ever seen, which is precisely what
`RULE-GATE-002` exists to refuse. The conformance suite still proves **46** rules able to fail, 0 not.

## What this deliberately does not do

- **It does not design the feature.** It produces a correct empty room, not furniture.
- **It does not write the Change Impact Brief.** That needs intent, which a generator has none of;
  `./run brief` pre-fills the facts and leaves the intent fields as explicit TODOs.
- **It does not commit.** It stages, because the index reads `git ls-files` and an unstaged file is invisible
  to ownership, boundaries and the counted claims — a local `verify` would pass on a tree CI fails on. What to
  commit stays a decision.
- **It does not widen the route-guard checker's scope.** `tools/checks/route_guards.py` reads
  `backend/app/routers/` only, which is `RISK-SEC-005`; the generator writes its router into that directory
  so the guard is seen, and closing the gap itself is that risk's own change, not this one.
- **It does not generate frontend tests beyond pure logic.** The frontend has one test tier by decision
  (ADR 0007) and rendering, routing and gestures stay untested (`RISK-TEST-004`). A generated component test
  would be the first one in the repository and would pull in a mounting library for a placeholder view.
- **It does not remove what it generated.** Removal is `git checkout` plus `rm`, because every edit it makes
  is to a tracked file and every addition is a new file — and the by-hand recipe is written down in
  [`docs/task-interface.md`](../task-interface.md). A `--remove` flag was considered and rejected: it would be
  a second code path over the same nine files, exercised roughly never, and the one thing worse than a
  generator you cannot undo is an undo you cannot trust.
- **It does not save anyone from reading the contract.** `RISK-DOC-001` is unchanged: nothing detects that a
  contributor grepped instead of querying the index, and nothing detects that they took the scaffold's output
  as permission to skip the decision procedure in [`AGENTS.md`](../../AGENTS.md).

## Consequences

A new unit now starts conformant instead of becoming conformant during review, which moves the boundary
rules from something a contributor must recall to something they must *break*. The generated unit's own
declaration is the artefact that carries the constraint forward: `architecture.toml` says, in the unit's
note, what the edge list withholds and why.

The costs are real. The generator now knows the shape of nine files it does not own — `main.py`'s router
imports, the SPA router's array, the guard file's sort order, the contract's two counts — and each of those
is a place a future refactor can break it. Every one of those edits fails loudly rather than silently: the
generator raises a tooling error naming the file whose shape it no longer recognises, and exits `3`. A
generator that half-succeeded would leave a tree that is neither the old one nor a working new one, which is
the state this repository has the least tooling to get out of.

The second cost is the fan-in ratchet above. Its re-open trigger is the third generated backend feature: at
that point `dependencies.py` will have been raised three times by a machine, and the honest response is
either to allowlist it deliberately or to admit the baseline no longer measures anything for that file.
