# Change Impact Brief 0016 — Supply chain: pin the inputs, classify the licences

| Field | Value |
|---|---|
| **Requested outcome** | Make what ships a function of the commit rather than the calendar, classify every dependency licence, and stop a committed credential from reaching a public repository. |
| **Owning unit** | `ops`, `be/leaves` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`policy/licenses.yaml`](../../policy/licenses.yaml) |
| **Rule IDs introduced** | `RULE-DEP-002` (licences), `RULE-DEP-003` (no committed credentials), `RULE-DEP-004` (pinning) |
| **Risks recorded** | `RISK-DEP-002` (the scanner's blind spots), `RISK-DEP-003` (passlib is unmaintained) |
| **Risks narrowed** | `RISK-DEP-001` — from "the binary changes under us" to "the pinned snapshot date ages silently" |
| **Entry points** | [`tools/checks/pinning.py`](../../tools/checks/pinning.py), [`tools/checks/licenses.py`](../../tools/checks/licenses.py), [`tools/checks/secret_scan.py`](../../tools/checks/secret_scan.py), [`backend/Dockerfile`](../../backend/Dockerfile) |
| **Affected public surfaces** | **None.** `python-jose` moves 3.3.0 → 3.5.0 behind an unchanged API. |
| **Known dependents** | Every image build. Both Dockerfiles must now agree on base-image **digests**, not just names. |
| **Uncertain / dynamic areas** | `RISK-DEP-002`, `RISK-DEP-003`. |
| **Analogous implementations** | `policy/licenses.yaml` follows `rules/waivers.yaml`: a classification with a recorded exception path, rather than a switch. |
| **Delivery Pattern** | **Security or Operability Change** — failure scenario, control, adversarial proof. |
| **Required tests** | Four negative fixtures, as the plan specifies: a strong-copyleft dependency, a committed credential, a floating base tag, an unhashed install. |
| **Intended scope** | Step 14. Replacing `passlib` is deliberately out, and recorded. |
| **Base revision** | `b77f485` |

## The failure this closes, twice observed

* **2026-08-04** — `mcp 2.0.0`, unpinned transitive: the image built, pushed, deployed green, and the service was down.
* **2026-08-25** — Taskwarrior rolled forward under `archlinux:latest` and broke every container test on an untouched backend.

Same defect both times: a build whose inputs nobody had written down.

## The subtle half

Four base images are now digest-pinned. That alone would **not** have prevented August 25.

`pacman` resolves against live mirrors at build time, so a digest-pinned `archlinux` still installs whatever `task` Arch published that morning. The package *repository* is therefore pinned as well, to an Arch Linux Archive snapshot dated `2026/08/25` — verified to yield Taskwarrior 3.5.0 with its theme files.

A digest-only pin is worse than no pin, because it **looks** pinned.

## SEC-7, answered by testing rather than reading

**`python-jose` 3.3.0 → 3.5.0, taken.** Verified drop-in against this application's exact usage — HS256 encode/decode, and an `alg: none` token still refused. All 159 unit tests pass.

**`bcrypt==4.0.1` stays, and now says why.** The finding predicted a future agent would "helpfully bump" it. Tested against bcrypt 5.0.0: it does not warn, it **fails** —

```
ValueError: password cannot be longer than 72 bytes
```

bcrypt 5 dropped the silent truncation passlib relies on, so every login would break. The comment in `requirements.txt` now says exactly that, because Dependabot *will* offer 5.0.0.

**passlib 1.7.4 is the latest release, from 2020-10-08** — unmaintained, not merely pinned, a distinction the original finding blurred. It is the only thing hashing passwords here, and it is frozen in place by a dependency it broke. `RISK-DEP-003`.

## What the checks found on their first run

Nothing alarming, and three things worth fixing: five unclassified licences (all permissive, classified by hand), and two credential-shaped literals in a test and a tool, which took the documented per-line exemption. That the exemption path was exercised immediately is the useful signal — a scanner with no escape hatch is a scanner people delete.

## Behaviour change

**None.** No route, schema or surface moves. `python-jose` upgrades behind an unchanged API.
