"""Bound what the deploy compose file is allowed to ask of the host, and what it must give up.

Emits `RULE-ID|message` lines; `tools/checks/deploy-compose.sh` turns them into gate failures.

Since 2026-08-28 the deploy key's forced command fetches ops/deploy/docker-compose.yml at the
deployed commit and applies it before starting the services, so this file is no longer a
description of production — it *is* production's configuration. That closed the drift that had
already produced three false claims about the running system, and it widened what merging to
main can do: compose can mount host paths, join the host network namespace and ask for
privilege, none of which application code can do from inside a container.

RULE-OPS-003 is the boundary on that widening. It is not a sandbox and does not pretend to be —
anyone who can merge to main can still change what the services run. What it stops is the
specific set of edits that convert a container-scoped change into a host-scoped one, quietly,
in a file that is easy to skim past in review because it is mostly YAML nobody reads twice.

Four refusals:

* `privileged: true` — a privileged container is the host.
* `network_mode: host` — removes the network boundary the deployment is built on. The services
  talk over the `traefik-public` network and publish no ports; this would undo both.
* a bind mount whose source escapes the service directory — `./data`, `./db` and `./users.db`
  are the deployment's own state. `/`, `/etc`, `/var/run/docker.sock` and `..` are not.
* `cap_add` — capabilities are privilege in smaller pieces.

RULE-OPS-004 is the other direction (finding SEC-003, ADR 0048). RULE-OPS-003 refuses what a
service may ask the host for; this one requires what every service must give up, so that a
write primitive or a command inside a container lands as an unprivileged user on a read-only
root with no capabilities:

* `read_only: true`, `security_opt: [no-new-privileges:true]` and `cap_drop: [ALL]`;
* an explicit numeric `user: "<uid>:<gid>"` that is not root and is the user the image's
  Dockerfile declares in its final stage — the image and the compose must agree, or one of
  them is wrong about what runs;
* that Dockerfile's final stage ends on a numeric, non-root `USER`.

A service may be held to less only while a dated shim in rules/shims.yaml names the exact
transitional shape (TRANSITIONS below). The shim's expiry is RULE-SEC-002's to enforce; this
check refuses the exception once the shim is gone, which is what makes the contract step
something the gate asks for rather than something a reader has to remember.

Scoped to ops/deploy/ only. The root docker-compose.yml is a development artefact that no host
ever reads, and constraining a developer's own machine would be a rule with no failure mode
worth having.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
DEPLOY_COMPOSE = ROOT / "ops" / "deploy" / "docker-compose.yml"
SHIMS = ROOT / "rules" / "shims.yaml"

# Bind-mount sources the deployment legitimately owns. Anything else is refused rather than
# pattern-matched against a list of dangerous paths — an allowlist fails closed on the mount
# nobody thought of, which is the one that matters.
ALLOWED_MOUNT_PREFIXES = ("./",)

# Which Dockerfile builds the image each deploy service runs. A service that is not listed is a
# failure, not a skip: the rule cannot say the image and the compose agree about a Dockerfile it
# does not know.
DOCKERFILES = {
    "backend": ROOT / "backend" / "Dockerfile",
    "frontend": ROOT / "frontend" / "Dockerfile",
}

# Docker's default capability set (moby, oci/caps/defaults.go). Dropping all of them but a named
# few is how a transitional root service is held to less than "everything" without `cap_add`,
# which RULE-OPS-003 refuses.
DOCKER_DEFAULT_CAPS = frozenset(
    {
        "AUDIT_WRITE",
        "CHOWN",
        "DAC_OVERRIDE",
        "FOWNER",
        "FSETID",
        "KILL",
        "MKNOD",
        "NET_BIND_SERVICE",
        "NET_RAW",
        "SETFCAP",
        "SETGID",
        "SETPCAP",
        "SETUID",
        "SYS_CHROOT",
    }
)


@dataclass(frozen=True)
class Transition:
    """The one shape a service may have instead of the floor, while `shim` is declared."""

    shim: str
    user: str
    keeps: frozenset[str]


# SHIM-OPS-001: the host's data was written by a root container and nobody has read who owns it
# (plan M0). Until the operator has run ops/deploy/volume_ownership.py and set the variable, the
# backend stays uid 0, and keeps DAC_OVERRIDE so that a file the root process could write
# yesterday it can still write today. Every other default capability is gone already.
TRANSITIONS = {
    "backend": Transition(
        shim="SHIM-OPS-001",
        user="${RUNWAY_BACKEND_USER:-0:0}",
        keeps=frozenset({"DAC_OVERRIDE"}),
    ),
}

NUMERIC_USER = re.compile(r"^(\d+):(\d+)$")

problems: list[str] = []


def fail(message: str) -> None:
    problems.append(f"RULE-OPS-003|{message}")


def harden(message: str) -> None:
    problems.append(f"RULE-OPS-004|{message}")


def check_service(name: str, service: dict) -> None:
    where = f"ops/deploy/docker-compose.yml service `{name}`"

    if service.get("privileged"):
        fail(f"{where} asks for `privileged: true`. A privileged container is the host")

    mode = service.get("network_mode")
    if mode == "host":
        fail(
            f"{where} asks for `network_mode: host`. The services reach each other over the "
            "traefik-public network and publish no ports; this removes both boundaries"
        )

    if service.get("cap_add"):
        fail(f"{where} asks for `cap_add`. Capabilities are privilege in smaller pieces")

    for volume in service.get("volumes") or []:
        # Long form: {type: bind, source: ..., target: ...}. Short form: "source:target[:mode]".
        if isinstance(volume, dict):
            source = str(volume.get("source", ""))
        else:
            source = str(volume).split(":", 1)[0]

        if not source or ":" in source:
            continue  # a named volume, not a bind mount

        if source.startswith(ALLOWED_MOUNT_PREFIXES) and ".." not in source:
            continue

        fail(
            f"{where} bind-mounts `{source}`, which is outside the service directory. The "
            "deployment owns ./data, ./db and ./users.db; a mount above them hands the host to a "
            "container"
        )


def declared_shims() -> set[str]:
    if not SHIMS.exists():
        return set()
    data = yaml.safe_load(SHIMS.read_text(encoding="utf-8")) or {}
    return {str(s.get("id")) for s in data.get("shims", []) or [] if isinstance(s, dict)}


def final_stage_user(dockerfile: Path) -> str | None:
    """The last `USER` of the last stage, or None when that stage declares none."""
    user = None
    for raw in dockerfile.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        word, _, rest = line.partition(" ")
        if word.upper() == "FROM":
            user = None
        elif word.upper() == "USER":
            user = rest.strip()
    return user


def _image_user(where: str, name: str) -> str | None:
    """The image's declared non-root user, or None after reporting why there is none."""
    dockerfile = DOCKERFILES.get(name)
    if dockerfile is None:
        harden(f"{where} is not mapped to a Dockerfile in tools/checks/deploy_compose.py")
        return None
    if not dockerfile.exists():
        harden(f"{where} maps to {dockerfile.relative_to(ROOT)}, which does not exist")
        return None
    declared = final_stage_user(dockerfile)
    rel = dockerfile.relative_to(ROOT)
    match = NUMERIC_USER.match(declared or "")
    if match is None:
        harden(
            f"{rel} ends its final stage without a numeric `USER <uid>:<gid>` (found "
            f"{declared!r}). A name can resolve to root; a number cannot hide it"
        )
        return None
    if "0" in match.groups():
        harden(f"{rel} declares `USER {declared}`, which is root")
        return None
    return declared


def check_hardening(name: str, service: dict, shims: set[str]) -> None:
    where = f"ops/deploy/docker-compose.yml service `{name}`"
    transition = TRANSITIONS.get(name)
    if transition is not None and transition.shim not in shims:
        transition = None

    if service.get("read_only") is not True:
        harden(f"{where} has no `read_only: true`. Only its mounts and a tmpfs may be writable")

    if "no-new-privileges:true" not in [str(s) for s in service.get("security_opt") or []]:
        harden(
            f"{where} has no `security_opt: [no-new-privileges:true]`. Without it a setuid "
            "binary in the image can still raise a process back to root"
        )

    dropped = {str(c).upper() for c in service.get("cap_drop") or []}
    if "ALL" not in dropped:
        if transition is None:
            harden(f"{where} does not declare `cap_drop: [ALL]`")
        elif dropped != DOCKER_DEFAULT_CAPS - transition.keeps:
            keeps = ", ".join(sorted(transition.keeps))
            harden(
                f"{where} must drop every default capability except {keeps} while "
                f"{transition.shim} stands, and `cap_drop: [ALL]` once it is removed"
            )

    image_user = _image_user(where, name)

    user = str(service.get("user", "")).strip()
    if transition is not None and user == transition.user:
        return
    match = NUMERIC_USER.match(user)
    if match is None:
        harden(f'{where} has no explicit numeric `user: "<uid>:<gid>"` (found {user!r})')
    elif "0" in match.groups():
        harden(f"{where} runs as `{user}`, which is root")
    elif image_user is not None and user != image_user:
        harden(
            f"{where} runs as `{user}` but its Dockerfile declares `USER {image_user}`; the "
            "files the image owns belong to the second one"
        )


def main() -> int:
    if not DEPLOY_COMPOSE.exists():
        fail("ops/deploy/docker-compose.yml is missing — it is what the deploy key applies")
    else:
        try:
            document = yaml.safe_load(DEPLOY_COMPOSE.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as error:
            fail(f"ops/deploy/docker-compose.yml is not valid YAML: {error}")
            document = {}

        shims = declared_shims()
        for name, service in (document.get("services") or {}).items():
            if isinstance(service, dict):
                check_service(name, service)
                check_hardening(name, service, shims)

    for problem in problems:
        print(problem)
    return 0


if __name__ == "__main__":
    sys.exit(main())
