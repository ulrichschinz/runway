# ADR 0016 — Briefs are generated but not written; references are checked but not everywhere

- **Date:** 2026-08-23
- **Status:** Accepted
- **Scope:** `docs`, `ops`

## Context

`docs/change-workflow.md` requires a Change Impact Brief for any change to production code,
recording thirteen fields. Roughly half of them are lookups the index can already answer —
owning unit, governing decision records, affected public surfaces, known dependents,
protecting tests, relevant blind spots — obtained by running `./run impact` once per changed
file and merging the answers by hand. The other half are statements of intent that no index
can produce: what was asked for, which delivery pattern applies, what the intended scope is.

Ten briefs have been written this way. The lookup half is mechanical, slow, and the first
thing to be skipped when a change is urgent — which is exactly when the brief matters most.

Separately, the contract's own self-check (`RULE-DOC-001`) resolves every path, command and
identifier that `AGENTS.md` names. But `AGENTS.md` is deliberately short — 168 lines against
a 250-line budget — and delegates its detail to `docs/adr/` and `docs/briefs/`. Those
documents were entirely unchecked. Two drifts were found the moment resolution was pointed
at them: ADR 0015 cited an `RISK-OPS-` id one higher than the one the ledger declares, and
ADR 0008 named the index manifest with a `.yaml` extension where the artefact built is
`.toml`. Both had passed every gate run since they landed.

Neither record is quoted verbatim here, and that is itself the finding: an identifier named
in prose is indistinguishable from one being declared, so a record explaining a dangling
reference would declare it. See the Decision below.

## Decision

**`./run brief` fills the lookup half and refuses to invent the rest.** Fields requiring
intent are emitted as literal TODO markers.

**`RULE-DOC-004` resolves the references in decision records and briefs**, as an extension of
the contract check rather than a new one — same script, same profile, one more rule id.

**It checks three classes of reference, and no others**: cited identifiers, relative
markdown links, and ADR numbers named in prose. Each has a ground truth to resolve against —
the ledger and waiver register, the filesystem, the ADR directory.

**Identifiers are read from `id:` fields, not from the file's text.** The register that
declares them is also prose, and a regex over it counts an id inside a rationale as
declared — so citing a dangling id while explaining the rule that catches dangling ids
would declare it and defeat the rule. Parsing structurally closes that, at the cost of a
convention: describe a wrong identifier, do not quote it. Rare enough to be cheap, unlike
the equivalent for paths.

**Backticked paths are not checked**, though two drafts of this rule tried. The first
resolved every backticked path that looked like one and produced 40 findings across the
existing corpus, all noise: records name files the way people say them — `deploy.yml`,
`query.py`, `tools/*.sh`. Narrowing to repository-rooted paths took that to a single real
finding, which looked like the answer until this very record failed its own rule twice: it
names `index/manifest.yaml` while quoting the drift it corrects, and `tools/checks/records.sh`
as an alternative that was deliberately never built. Both mentions are correct. Nothing
syntactic separates a reference from a mention, so the check was removed rather than
suppressed. **Records point at files by linking to them**, and links are checked.

**Records that are no longer Accepted are exempt.** A superseded or rejected decision
describes a world that has moved on. Holding it to today's file layout would force edits that
falsify the history the record exists to preserve.

## Alternatives considered

- **Have `brief` write the file into `docs/briefs/` directly.** Rejected: it would have to
  invent a number and a slug, and the generated half is a starting point that gets edited
  before it is worth keeping. Printing composes with redirection and makes the review step
  unavoidable.
- **Have `brief` infer the delivery pattern from the diff shape.** Tempting — a change that
  touches only tests looks like characterization, one that adds a route looks like New
  Capability. Rejected: the pattern is a statement about intent, and a confident wrong guess
  is worse than a blank, because a blank gets filled and a guess gets accepted. This is the
  same reasoning that makes the index report blind spots instead of guessing.
- **A separate check script for records.** Rejected: it would duplicate
  `_declared_identifiers()` and the ledger parsing that `contract_check.py` already owns, and
  two implementations of "does this identifier exist" will disagree eventually.
- **Check every backticked path, and add a suppression syntax for prose.** Rejected: it makes
  every record author learn an escaping convention in order to describe a file in a sentence.
  The cost lands on writing records, which is the behaviour we want more of. Linking is a
  convention authors already know, and it carries the check for free.

## Consequences

- The lookup half of a brief costs one command instead of one `impact` call per changed file.
- Two dangling references were fixed on the way in — a risk id and a file extension — and
  neither class can silently return.
- **Filenames named in prose are not checked at all.** A record saying `query.py` when it
  means `tools/index/query.py`, or naming a file that has since been deleted, still passes.
  The mitigation is a convention, not a control: point at files with links. Recorded as
  `RISK-DOC-002`.
- **Anchor targets are not verified.** A link to a section that was later renamed still
  resolves, because only the file half of the target is checked.
- ADR 0008's *Related* section was converted from named paths to links, so the drift found
  there is covered going forward by a mechanism that cannot produce false positives.
- `./run brief` exits `4` on a stale index rather than answering. The alternative — answering
  from a stale graph with a warning — produces a brief that reads as authoritative and is not.
