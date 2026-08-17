# ADR 0015 — The build platform is pinned, not inherited from the runner

- **Date:** 2026-08-17
- **Status:** Accepted
- **Scope:** `ops`

## Context

`deploy.yml` built both images with `docker/build-push-action` and no `platforms:` input. That action
builds for the architecture of the runner it happens to execute on. Every run so far has used
`ubuntu-latest`, which is x86_64, and production is a single x86_64 VPS — so every image published to
date has been correct.

It has been correct *by coincidence*, not by construction. Nothing in the repository stated the target
architecture, and nothing would have failed if the build had moved somewhere else.

The question became concrete when self-hosted runners were evaluated on 2026-08-17 and rejected for this
repository — it is public, so hosted minutes are free and unmetered, and its container test tier cannot
run on arm64. One of the candidate machines was Apple Silicon. A build there would publish an **arm64**
image as `:latest`, the deploy step would pull it onto the x86_64 host, and the container would die with
`exec format error`. That is not a failed deploy — it is a deploy that **takes production down instead
of updating it**, and it would do so while every gate reported green, because nothing in the gate
inspects image architecture.

The same trap is reachable without any runner change: the emergency path in
`docs/operations.md` builds and pushes from a developer machine, and this repository's only
developer machine is arm64.

## Decision

**Both build steps pin `platforms: linux/amd64` explicitly**, and `docker/setup-buildx-action` is added
because the default docker driver cannot satisfy a `platforms:` request.

The pin is single-architecture on purpose. Production is one x86_64 host (decision **F1** puts scaling,
HA and multi-tenancy out of scope), so there is no second consumer to build for, and a multi-arch
manifest would roughly double build time to serve nobody.

## Alternatives considered

- **Leave it unpinned and require x86_64 runners by convention.** Rejected: a convention that is not
  written down anywhere and produces a production outage when broken is the weakest possible control.
  The failure is also silent at build time — the image builds and pushes successfully.
- **Build a multi-arch manifest (`linux/amd64,linux/arm64`).** Rejected as speculative generality. It
  would make any runner safe, but it pays a permanent build-time cost for an architecture no deployment
  target uses, and the Taskwarrior base image has no arm64 manifest anyway — the backend build would
  fail (the same constraint recorded as `RISK-TEST-001`).
- **Assert the architecture of the pushed image as a gate check.** Attractive, and strictly stronger
  than a pin, but it can only run after a push has already happened. Kept as a candidate for Step 13's
  public-surface protection, where image identity is already in scope.

## Consequences

- A build from an arm64 machine now fails loudly at build time instead of publishing an image that
  breaks production on deploy.
- The declared target architecture lives in the workflow rather than in nobody's head. A future move to
  a different runner does not silently change what is shipped.
- **The pin is not enforced by a gate check.** Nothing fails if a future edit removes it. Recorded as
  `RISK-OPS-002` with the re-open trigger *a second deployment target on a different architecture, or a
  build that runs anywhere other than a hosted x86_64 runner*.
- The backend image cannot be built on arm64 at all while Taskwarrior is installed from Arch, so the
  pin costs nothing that was otherwise available.
