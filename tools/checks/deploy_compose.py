"""Bound what the deploy compose file is allowed to ask of the host.

Emits `RULE-ID|message` lines; `tools/checks/deploy-compose.sh` turns them into gate failures.

Since 2026-08-28 the deploy key's forced command fetches ops/deploy/docker-compose.yml at the
deployed commit and applies it before starting the services, so this file is no longer a
description of production — it *is* production's configuration. That closed the drift that had
already produced three false claims about the running system, and it widened what merging to
main can do: compose can mount host paths, join the host network namespace and ask for
privilege, none of which application code can do from inside a container.

This rule is the boundary on that widening. It is not a sandbox and does not pretend to be —
anyone who can merge to main can still change what the services run. What it stops is the
specific set of edits that convert a container-scoped change into a host-scoped one, quietly,
in a file that is easy to skim past in review because it is mostly YAML nobody reads twice.

Four refusals:

* `privileged: true` — a privileged container is the host.
* `network_mode: host` — removes the network boundary the deployment is built on. The services
  talk over the `traefik-public` network and publish no ports; this would undo both.
* a bind mount whose source escapes the service directory — `./data` and `./users.db` are the
  deployment's own state. `/`, `/etc`, `/var/run/docker.sock` and `..` are not.
* `cap_add` — capabilities are privilege in smaller pieces.

Scoped to ops/deploy/ only. The root docker-compose.yml is a development artefact that no host
ever reads, and constraining a developer's own machine would be a rule with no failure mode
worth having.
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
DEPLOY_COMPOSE = ROOT / "ops" / "deploy" / "docker-compose.yml"

# Bind-mount sources the deployment legitimately owns. Anything else is refused rather than
# pattern-matched against a list of dangerous paths — an allowlist fails closed on the mount
# nobody thought of, which is the one that matters.
ALLOWED_MOUNT_PREFIXES = ("./",)

problems: list[str] = []


def fail(message: str) -> None:
    problems.append(f"RULE-OPS-003|{message}")


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
            "deployment owns ./data and ./users.db; a mount above them hands the host to a "
            "container"
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

        for name, service in (document.get("services") or {}).items():
            if isinstance(service, dict):
                check_service(name, service)

    for problem in problems:
        print(problem)
    return 0


if __name__ == "__main__":
    sys.exit(main())
