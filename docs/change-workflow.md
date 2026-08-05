# Change workflow — delivery patterns and briefs

The root [`AGENTS.md`](../AGENTS.md) says to pick a pattern before editing. This is what
each one requires.

Every applicable obligation must be **done**, justified **not applicable**, or **tracked**
as an approved multi-step transition before the change is complete. The order can vary; the
completeness cannot.

## The Change Impact Brief

Any change to production code gets a brief in `docs/briefs/`. Copy the newest one — the
fields are stable. Recording, in order: the requested outcome, the owning unit, applicable
contracts and rule ids, entry points and flow, affected public surfaces, known dependents,
uncertain or dynamic areas, analogous implementations, the selected pattern, required
tests, intended scope, and the base revision.

Most of it comes from `./run impact <path>`. The brief is where you say what you *intend*;
the diff is where you say what you *did*. When they differ materially, revise the brief.

> `make brief` will generate a pre-filled brief from the index and the working diff, and
> validate its references. Until then briefs are written by hand from the same source.

## Bug Fix

1. **Reproduce it in a failing test first.** A fix without a reproduction is a guess that
   happened to make the symptom go away.
2. Fix the cause.
3. The regression test stays. It is the only thing preventing the bug's return.
4. If the bug reached production, say so in `docs/operations.md` and record what would
   have caught it — that is usually a more valuable change than the fix.

## New Capability

Owner, contract, vertical slice, failure behaviour, tests.

1. Name the owning unit in `architecture.toml`. A capability with no owner is nobody's.
2. Build a **vertical slice** — surface to storage — rather than a layer at a time.
3. Decide what happens when it fails, and test that path. A capability with no failure
   behaviour has one anyway; it is just undesigned.
4. If it adds a REST route, it adds an MCP tool named after the handler function. That is
   a public surface — see the migration pattern.

## Behaviour-Preserving Refactor

1. **Characterize first.** Pin current behaviour, including its defects, before moving
   anything. If no test exists, that is the first task, not an excuse.
2. Move, do not improve. A refactor that also fixes something produces a diff where nobody
   can see either clearly.
3. Enumerate the classes of change in the brief, so a reviewer can check the claim rather
   than trust it.
4. The tests must pass **unchanged**. A test edited during a refactor is a behaviour change
   wearing a disguise.

## Public-Surface or Data Migration

**Expand → migrate → switch → contract.** Every intermediate step stays deployable,
compatible, observable and rollback-capable.

1. **Expand** — add the new form alongside the old. Nothing breaks yet.
2. **Migrate** — move data or consumers across. Reversible at every point.
3. **Switch** — make the new form authoritative.
4. **Contract** — remove the old form, in its own change, once nothing uses it.

Surfaces are treated as externally consumed (decision F2). That includes **MCP tool names,
which are route handler function names** — renaming a Python function is a breaking change
to a public surface, and `./run impact` will tell you which tools are affected.

Compatibility shims are tracked with a removal step and counted down to zero.

## Security or Operability Change

**Failure scenario, control, adversarial proof.**

1. State the failure scenario concretely: who does what, and what they get.
2. Implement the control.
3. **Construct the violation and watch the gate go red.** A security control nobody has
   seen fail is an assumption.
4. Where a property cannot be made executable, record it as a residual risk with a re-open
   trigger rather than leaving it implied.

The SEC-3 investigation is the worked example: the hypothesis was a critical cross-tenant
breach, the adversarial test confirmed the *mechanism* and refuted the *exploit*, and the
severity moved to medium with the evidence recorded in `rules/waivers.yaml`.
