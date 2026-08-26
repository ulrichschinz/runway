"""Every base image is pinned by digest, and Python dependencies install from a hashed lock.

Emits `RULE-ID|message` lines; `tools/checks/supply-chain.sh` turns them into gate failures.

A floating tag means the thing shipped is a function of the calendar rather than of the
commit. This repository has been bitten twice by exactly that:

* 2026-08-04 — `mcp 2.0.0`, an unpinned transitive, shipped an image whose backend could not
  start, through a green deploy (ADR 0004).
* 2026-08-25 — Taskwarrior rolled forward under `archlinux:latest` and broke every container
  test on an unchanged backend (`RISK-DEP-001`).

Both were the same defect wearing different clothes: a build whose inputs nobody had written
down. A digest and a hashed lock are the written-down version.

`pacman -Sy` is checked too, because a digest alone does not pin what pacman installs —
pacman resolves against live mirrors at build time, so the package repository needs pinning
as well, which the Arch Linux Archive does by date.
"""

from __future__ import annotations

import re
import subprocess  # noqa: S404  # tooling: reads the tracked-file list
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

_FROM = re.compile(r"^\s*FROM\s+(?P<ref>\S+)", re.MULTILINE)
_PACMAN_SY = re.compile(r"pacman\s+-S(?!yu)y\b")
_ARCHIVE_MIRROR = re.compile(r"archive\.archlinux\.org/repos/\d{4}/\d{2}/\d{2}/")

problems: list[str] = []


def fail(message: str) -> None:
    problems.append(f"RULE-DEP-004|{message}")


def dockerfiles() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    return [rel for rel in out if Path(rel).name.startswith("Dockerfile")]


def _instructions(text: str) -> str:
    """The Dockerfile with comment lines removed.

    A comment is not an instruction, and this check reads its own documentation: the builder
    stage explains what `pacman -Sy` did wrong, and the first version of this rule reported
    that explanation as the violation.
    """
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))


def check_images() -> None:
    for rel in dockerfiles():
        raw = (ROOT / rel).read_text(encoding="utf-8")
        text = _instructions(raw)

        for match in _FROM.finditer(text):
            ref = match.group("ref")
            if ref.startswith("$"):
                continue  # a build argument, resolved by the caller
            # A named earlier stage, not a registry reference.
            if "/" not in ref and ":" not in ref and "@" not in ref:
                continue
            if "@sha256:" not in ref:
                line = text[: match.start()].count("\n") + 1
                fail(
                    f"{rel}:{line} uses {ref!r}, a floating tag — pin it by digest so what "
                    "ships is a function of the commit rather than the calendar"
                )

        if "pacman" in text:
            if _PACMAN_SY.search(text):
                fail(
                    f"{rel} runs `pacman -Sy`, a sync without upgrade — the classic "
                    "partial-upgrade pattern. Use `-Syu` against a pinned archive snapshot"
                )
            if not _ARCHIVE_MIRROR.search(text):
                fail(
                    f"{rel} installs Arch packages without pinning the repository to a dated "
                    "archive snapshot. A base-image digest does not pin this: pacman resolves "
                    "against live mirrors at build time, so the binary version is still "
                    "whatever Arch published that day"
                )


def check_python_lock() -> None:
    backend = ROOT / "backend"
    for lock in ("requirements.lock", "requirements-dev.lock"):
        path = backend / lock
        if not path.exists():
            fail(f"backend/{lock} is missing — generate it with `./run lock`")
            continue
        if "--hash=" not in path.read_text(encoding="utf-8"):
            fail(f"backend/{lock} carries no hashes — regenerate it with --generate-hashes")

    for rel in dockerfiles():
        text = _instructions((ROOT / rel).read_text(encoding="utf-8"))
        if "pip install" not in text:
            continue
        for line in text.splitlines():
            if "pip install" in line and "--require-hashes" not in line:
                fail(
                    f"{rel} runs `pip install` without --require-hashes — install from the "
                    "lock so a substituted artefact is refused rather than trusted"
                )


def main() -> int:
    check_images()
    check_python_lock()
    for line in problems:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
