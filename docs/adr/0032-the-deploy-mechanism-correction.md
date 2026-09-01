# ADR 0032 — Bake the compose into the image, because the mechanism we documented never existed

- **Date:** 2026-08-31
- **Status:** Accepted
- **Scope:** `ops`, `docs`, `rules`, `backend`

## Context

Commit `135ab62`, "Deploy the compose file instead of describing it", decided that this repository should
*determine* its deployment rather than describe it. It shipped `ops/deploy/deploy-command.sh`: a forced
command that would read the deployed commit out of `SSH_ORIGINAL_COMMAND`, fetch the compose file from
`raw.githubusercontent` at that commit, validate it with `docker compose config -q`, back up the file it
replaced, and only then pull. It failed closed on every branch. It was reviewed and merged.

It has no decision record. The ADR sequence skips from 0027 to 0029, and the gap is exactly this change —
the one that widened `main` from container-scoped to host-scoped. That is not incidental to what follows:
an ADR would have had to state what the forced command *currently* was in order to say what it was being
changed to, and the claim would have had to survive being written down next to its own alternatives.

**It was never installed, and no forced command ever pointed at it.** This was found on 2026-08-31 while
carrying out its own installation runbook, by reading the host.

What the host actually does, and has done throughout:

```
command="sudo /opt/scripts/deploy.sh runway",no-port-forwarding,no-X11-forwarding,no-agent-forwarding
```

`/opt/scripts/deploy.sh` is shared by all eight services on that host and takes the service name as its
argument. Its compose-refresh section iterates the stack's images, pulls each, and tries to extract
`/opt/stack/docker-compose.yml` from it. The first image carrying that file wins and it is written over the
on-disk compose; then it pulls and runs `up -d --remove-orphans`. **An image with no baked file leaves the
host's copy untouched, silently.**

Runway's images carried no such file. That is the whole explanation for a fact this repository had recorded
as a mystery: the host's compose kept its 25 August mtime while deploy after deploy reported success. Images
shipped. Configuration did not.

Three details make the documented mechanism worse than merely absent:

1. The installation runbook instructed the reader to repoint the deploy key with a `sed` addressed to a line
   containing `docker compose pull`. That string occurs in **no** `authorized_keys` on the host. The command
   would have matched nothing and reported success.
2. Had the script been installed, it would have failed anyway. `/etc/sudoers.d/deploy` permits the deploy
   account to `sudo` exactly one program, `/opt/scripts/deploy.sh`. Every `sudo -n docker compose` call in
   the fetching script would have been refused, and the script fails closed — so the first real deploy
   through it would have deployed nothing.
3. The claim that the forced command "now fetches `ops/deploy/docker-compose.yml` at this commit and applies
   it" was merged to `main` on 2026-08-31, hours before it was found to be false.

This is the fifth stale claim about production on this programme, and the first that was **never true**. The
other four were accurate when written and rotted afterwards. This one described a mechanism the repository
had authored rather than one it had observed, and no gate can tell those apart: every check here reads
repository facts, and the fact in question lived on a host that CI cannot reach.

## Decision

**1. Adopt the host's existing mechanism rather than replace it for one service.**

[`backend/Dockerfile`](../../backend/Dockerfile) copies
[`ops/deploy/docker-compose.yml`](../../ops/deploy/docker-compose.yml) to `/opt/stack/docker-compose.yml`.
The host script already knows what to do with it; runway stops being a special case in a script that carries
no other service's name. No host edit is required — no `authorized_keys` change, no `sudoers` change, no new
script — which is the decisive advantage over reinstating the fetching design. The dangerous step is not
made safer; it is removed.

The baked path is deliberately service-agnostic. `/opt/stack/…`, not `/opt/runway/…`, because the shared
script must not learn a vendor name in order to serve us.

**2. The backend build context becomes the repository root.**

A file can only enter an image from inside its own build context, and the compose file has exactly one
source of truth. Copying it into `backend/` to keep the narrower context would recreate the duplication —
and therefore the drift — that this whole line of work exists to remove.

So [`deploy.yml`](../../.github/workflows/deploy.yml) builds with `context: .` and `file: ./backend/Dockerfile`,
the root [`docker-compose.yml`](../../docker-compose.yml) does the same, and
[`.dockerignore`](../../.dockerignore) bounds what that widening admits.

**3. `.dockerignore` denies everything and then admits two paths.**

`*`, then `!backend` and `!ops/deploy/docker-compose.yml`. An exclusion list is wrong by default: every
directory added to this repository afterwards would be shipped into the build context until someone
remembered to exclude it. Deny-all inverts that — a new directory is invisible to the build until it is
deliberately named. The frontend build and the container-test tier are unaffected, because Docker reads the
`.dockerignore` beside each context root and theirs are elsewhere.

**4. The fetching script is deleted, not kept as a fallback.**

Keeping it would leave two documented mechanisms, one of which does not run. The failure this ADR records
is precisely a plausible description outliving the thing it described; a dead script retained "just in
case" is that failure preserved in the tree.

**5. The corrections are made where the false claims were, not only here.**

`docs/operations.md`, `.github/workflows/deploy.yml` and the compose file's own header each carried the
fiction. Each now states what the host does and says plainly that it previously said otherwise. A correction
that lives only in an ADR is not a correction; nobody debugging a deploy reads the ADR index first.

## Consequences

- Configuration reaches the host on the same push as the code it belongs to, through the mechanism the host
  already runs, with no privileged host edit.
- `RISK-OPS-002` is narrowed rather than closed. Drift is now corrected by every deploy instead of merely
  detected — but nothing verifies the write happened, and the host script's fall-through is silent. A deploy
  that stops baking the file is indistinguishable from one that never needed to. That is the same silence
  that hid this for six days, and it is why the risk stays open.
- `RISK-DOC-004` is re-opened. Its trigger was "a fifth stale claim is found", and this is it. The trigger is
  not re-armed with a sixth count: counting them has prevented none of the five.
- The backend build context is larger. `.dockerignore` holds it to the backend tree plus one file, and the
  layer cache is unaffected because the admitted set is the same one the narrower context sent.
- The commit sha in the deploy job's `script:` is now documented as decorative. Anyone reading `deploy.yml`
  previously had every reason to believe it was load-bearing.

## Alternatives considered

**Install the fetching script and repoint the forced command.** Rejected. It needs three privileged edits on
a shared host — `authorized_keys`, `sudoers`, and the script itself — to reach a place the host already
occupies for every other service. Its one genuine advantage is that the compose would be pinned to the
deployed commit rather than to whatever the image carries; but the image *is* built from that commit, so the
two agree by construction except when someone rebuilds a tag, which this repository does not do.

**Keep a copy of the compose under `backend/` and gate the two for byte-equality.** Rejected. It trades a
context widening for a new rule, a new fixture and a second copy of a file whose entire problem has been
copies of it drifting.

**Do nothing; apply the compose by hand when it changes.** Rejected — that is the state that produced four
of the five stale claims. It was also, in practice, the state this repository was in while believing
otherwise, which is worse than knowing.

## What this does not settle

Nothing here reads the host. The gate proves the file is baked into the image; it cannot prove the host
extracted it, because CI has no access to that host and `RISK-OPS-002` therefore stays open. The honest
verification remains what found this problem: someone reading the host after a deploy.

Nor does it address why a mechanism could be written, reviewed and merged without anyone checking that its
counterpart existed. `RULE-DOC-001` checks claims in `AGENTS.md` against the repository; there is no
equivalent for claims about a machine, and this ADR does not invent one.
