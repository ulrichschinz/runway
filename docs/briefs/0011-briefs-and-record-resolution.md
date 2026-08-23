# Change Impact Brief 0011 — Generated briefs, and records that resolve

| Field | Value |
|---|---|
| **Requested outcome** | Stop writing the mechanical half of a Change Impact Brief by hand, and stop decision records from carrying references that point at nothing. |
| **Owning unit** | `docs`, `ops` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`docs/change-workflow.md`](../change-workflow.md) |
| **Rule IDs introduced** | `RULE-DOC-004` |
| **Risks recorded** | `RISK-DOC-002` (paths named in prose are not resolved) |
| **Entry points** | [`tools/brief.py`](../../tools/brief.py), [`tools/checks/contract_check.py`](../../tools/checks/contract_check.py), [`run`](../../run) |
| **Affected public surfaces** | **None.** No route, MCP tool, schema or env var is touched. |
| **Known dependents** | **None.** `tools/brief.py` is new and nothing imports it; the contract check gains a function and no caller changes. |
| **Uncertain / dynamic areas** | `RISK-DOC-002`. The index reported `BLIND-MCP-001`, `BLIND-OPS-001`, `BLIND-TASK-001` and `BLIND-TEST-001` as keyword-relevant; none bears on this change. |
| **Analogous implementations** | [`tools/index/cli.py`](../../tools/index/cli.py) — the existing adapter over the same canonical query layer. `tools/brief.py` is a second one, and adds aggregation and presentation only, for the same reason. |
| **Delivery Pattern** | **New Capability**, plus a Security-or-Operability-shaped proof obligation for the new rule: the violation was constructed and the gate observed going red. |
| **Required tests** | One negative fixture (`DOC-004`) constructing a record that cites an undeclared identifier. The rule was additionally exercised against the entire existing corpus of 9 records and 10 briefs, which is where both real defects surfaced. |
| **Intended scope** | Step 10 of `docs/plan/phase-0-2.md`. `./run brief` moves from stub to implementation; `RULE-DOC-004` is added. `scaffold`, `decay-review` and `rebuild-verify` remain stubs. |
| **Base revision** | `6445960` |

## Two halves of a brief

Of the thirteen fields `docs/change-workflow.md` requires, roughly half are lookups the index
can already answer and were being assembled by running `./run impact` once per changed file.
The other half are statements of intent.

`./run brief` fills the first half and emits the second as literal TODO markers. It does not
guess the delivery pattern from the diff shape, though the shape is often suggestive — a
confident wrong guess is worse than a blank, because a blank gets filled and a guess gets
accepted. That is the same reasoning that makes the index report blind spots instead of
inferring past them.

Every fact it prints comes from `tools/index/query.py`, the layer the CLI and MCP adapters
already share. The generator adds aggregation, nothing else.

It exits `4` on a stale index rather than answering, and includes untracked files in the diff
— because the index reads `git ls-files`, so a new file is invisible until staged, and a brief
that silently omitted it would describe a change that is not the one being made.

## The records were never checked

`RULE-DOC-001` resolves every path, command and identifier in `AGENTS.md`. But the contract
is 168 lines against a 250-line budget and delegates its detail to `docs/adr/` and
`docs/briefs/` — which nothing checked at all. Pointing resolution at them found two real
defects immediately, both of which had passed every gate since they landed:

- a decision record citing a `RISK-OPS-` id one higher than the one the ledger declares;
- another naming the index manifest with a `.yaml` extension where the artefact built is
  `.toml`.

Neither is quoted verbatim anywhere in this change, and that is itself a finding — see below.

## What the rule checks, and what two drafts got wrong

`RULE-DOC-004` resolves three classes: cited identifiers, relative markdown links, and ADR
numbers named in prose.

It does **not** resolve file paths, though two drafts did. The first checked every backticked
path and produced 40 findings across the existing corpus, every one noise — records name files
the way people say them (`deploy.yml`, `query.py`, `tools/*.sh`). Narrowing to
repository-rooted paths cut that to a single real finding and looked like the answer, until
ADR 0016 failed its own rule twice: it names a file that was deliberately never built, and
quotes the wrong path it exists to correct. Both mentions are right. Nothing syntactic
separates a reference from a mention, so the check came out rather than acquiring a
suppression syntax that every record author would have to learn.

Records point at files by **linking** to them instead, and links are checked. ADR 0008's
*Related* section was converted accordingly, so the defect found there stays covered by a
mechanism that cannot produce false positives.

## An identifier register that declared its own typos

Adding the rule exposed a weakness in the machinery `RULE-DOC-001` already depended on.
`_declared_identifiers()` regexed the ledger and waiver files as text, so any id appearing
anywhere — including inside a rationale explaining a drift — counted as declared. Naming the
dangling id as an example would have made that very id resolve.

Both files are now parsed structurally, for `id:` fields only. This makes `RULE-DOC-001`
stricter as a side effect, and it is the reason a wrong identifier is described in words
rather than quoted throughout this change. Unlike the equivalent convention for paths, that
one is cheap: naming a dangling id in prose is rare, and describing it reads fine.

## Behaviour change

**None in the application.** No backend or frontend code is touched, and no public surface
moves. `./run brief` changes from exiting `3` to doing its job, which is the change this step
exists to make.
