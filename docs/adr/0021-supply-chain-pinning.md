# ADR 0021 — Pin the inputs, classify the licences, and test the pins you are afraid to move

- **Date:** 2026-08-26
- **Status:** Accepted
- **Scope:** `ops`, `backend`, `frontend`

## Context

This repository has shipped two production failures from the same defect, three weeks apart:

* **2026-08-04** — `mcp 2.0.0`, an unpinned transitive, produced an image whose backend could
  not start. It built, it pushed, the deploy went green, the service was down (ADR 0004).
* **2026-08-25** — Taskwarrior rolled forward under `archlinux:latest` and broke every
  container test on a backend nobody had touched (`RISK-DEP-001`).

Both are builds whose inputs nobody had written down. Nine direct Python dependencies were
pinned exactly; everything underneath them, and all four base images, were a function of the
calendar.

Separately, no dependency licence had ever been classified, and nothing looked for committed
credentials in a **public** repository.

## Decision

### Pin the inputs, all the way down

Four base images by digest. Python installs from a `uv`-generated lock with artefact hashes
and `--require-hashes`, so a substituted artefact is refused rather than trusted.

**A digest does not pin what `pacman` installs.** That is the subtle half and the one that
caused the August 25 incident: pacman resolves against live mirrors at build time, so a
digest-pinned `archlinux` still yields whatever `task` Arch published that morning. The
package *repository* is therefore pinned too, to an Arch Linux Archive snapshot dated
`2026/08/25`, which is what actually makes the binary reproducible. Verified: that snapshot
yields Taskwarrior 3.5.0 with its theme files.

`pacman -Sy` also became `-Syu`. Sync-without-upgrade is the classic partial-upgrade pattern,
and against a frozen snapshot `-Syu` is consistent by construction.

### Classify every licence, and let unknown fail closed

`policy/licenses.yaml` classifies all 305 installed dependencies across both ecosystems. The
images are published from a public repository, so a dependency's licence is an obligation
passed to whoever redeploys them.

**Unknown is treated as forbidden.** A dependency whose licence nobody could determine is not
one whose licence is fine; it is one nobody has looked at. The escape hatch — `resolved_unknowns`
— costs a minute of reading rather than a suppression, which is the correct relative price.

Five licences were classified by hand on the way in rather than waved through: two spellings
of MPL-2.0, `MIT-0`, `BlueOak-1.0.0`, and `CC-BY-4.0` for `caniuse-lite`, which is a
browser-support *data set* rather than code, and whose obligation is credit.

### Scan for credentials, and say what the scan cannot see

Pattern-based, over tracked files only. It catches provider-issued credentials by their
prefixes and high-entropy assignments to credential-shaped names.

It will miss a secret that looks like ordinary prose, and it only reads the current tree — a
credential committed and later deleted stays in history and stays disclosed. Recorded as
`RISK-DEP-002`, with rotation named as the remedy, because deletion is not one.

## SEC-7, re-evaluated by testing rather than reading

The finding said `python-jose` carried advisories and that `bcrypt==4.0.1` was pinned "for an
undocumented reason a future agent will helpfully bump". Both were checked against the actual
packages.

**`python-jose` 3.3.0 → 3.5.0, taken.** Verified drop-in against this application's exact
usage: HS256 encode and decode, and an `alg: none` token still refused. All 159 unit tests
pass on it.

**`bcrypt==4.0.1` stays, and the reason is now written down with evidence.** passlib 1.7.4
reads `bcrypt.__about__.__version__`, which bcrypt removed. Installing bcrypt 5.0.0 alongside
passlib does not warn — it **fails**:

```
ValueError: password cannot be longer than 72 bytes, truncate manually if necessary
```

bcrypt 5 dropped the silent truncation passlib depends on, so every login would break. The
comment in `requirements.txt` now says exactly that, and Dependabot is expected to offer
5.0.0.

**passlib 1.7.4 is the latest release, from 2020-10-08.** It is unmaintained, not merely
pinned — a distinction the original finding blurred. Replacing it is a real migration, because
it means re-verifying stored password hashes against a different implementation, and it is not
in this step's scope. Recorded as `RISK-DEP-003`.

## Alternatives considered

- **Pin the `task` package version instead of the repository snapshot.** Rejected: Arch drops
  old package versions within weeks, so a version pin makes the build unbuildable rather than
  reproducible. The archive snapshot has the opposite property — it is the whole repository,
  frozen.
- **Digest-pin the base image and leave `pacman` alone.** Rejected: this is precisely the
  configuration that failed on 2026-08-25, and it *looks* pinned, which is worse than looking
  unpinned.
- **Replace `passlib` in this step.** Rejected as scope: it touches stored credentials for
  every user and deserves its own change with its own migration evidence.
- **Use a hosted secret scanner only.** Rejected: the local check runs in `check`, seconds
  after the paste, where the fix is still free. Push protection is a second net, not a first.
- **Vendor the `task` binary into the repository.** Rejected — a binary blob nobody can audit,
  updated by hand, is a worse supply chain than a dated snapshot of a signed package
  repository.

## Consequences

- Builds are reproducible from the commit. `RISK-DEP-001` narrows to its remaining cost: the
  archive date is one someone must move deliberately, and **nothing announces that a pinned
  snapshot has aged**. Dependabot does not watch it.
- Dependabot watches everything that can be watched — pip, npm, docker, actions — with `mcp`
  held at `<2.0.0` and the reason attached. Pinning without it is freezing; pinning with it is
  currency by decision.
- 40 rules are now proven able to fail, up from 36. Four new fixtures: a GPL dependency, a
  committed AWS key, a floating base image, and an unhashed install.
- `RULE-TI-002` became stricter as a side effect. It compares base images between the runtime
  and test Dockerfiles, and now compares **digests** — the tier that proves the Taskwarrior
  binary behaves must build the same binary the runtime image ships.
