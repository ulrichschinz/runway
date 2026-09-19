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


def fail(message: str, rule: str = "RULE-DEP-004") -> None:
    problems.append(f"{rule}|{message}")


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


# Each lock and the intent files it is compiled from — the same pairs `tools/lock.sh` runs.
_LOCKS = {
    "requirements.lock": ("requirements.txt",),
    "requirements-dev.lock": ("requirements.txt", "requirements-dev.txt"),
}
_PIN = re.compile(
    r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(?P<op>[=<>!~]=?=?)\s*(?P<ver>[^\s;#\\]+)"
)


def drift(message: str) -> None:
    fail(message, "RULE-DEP-005")


def _normalise(name: str) -> str:
    """PEP 503: `Pydantic_Settings` and `pydantic-settings` are the same distribution."""
    return re.sub(r"[-_.]+", "-", name).lower()


def _intent(rel: str) -> dict[str, tuple[str, str, int]]:
    """Direct dependencies declared in an intent file: name -> (operator, version, line)."""
    pins: dict[str, tuple[str, str, int]] = {}
    for number, raw in enumerate(
        (ROOT / "backend" / rel).read_text(encoding="utf-8").splitlines(), 1
    ):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        match = _PIN.match(line)
        if match is None:
            drift(f"backend/{rel}:{number} {line!r} is not a `name==version` pin")
            continue
        pins[_normalise(match["name"])] = (match["op"], match["ver"], number)
    return pins


def _locked(rel: str) -> dict[str, tuple[str, list[str]]]:
    """Every package in a lock: name -> (version, the `# via` sources that pulled it in)."""
    entries: dict[str, tuple[str, list[str]]] = {}
    current: str | None = None
    for raw in (ROOT / "backend" / rel).read_text(encoding="utf-8").splitlines():
        if raw and not raw[0].isspace() and not raw.startswith("#"):
            match = _PIN.match(raw)
            if match is not None:
                current = _normalise(match["name"])
                entries[current] = (match["ver"], [])
            continue
        comment = raw.strip().lstrip("#").strip()
        if current is not None and comment:
            entries[current][1].append(comment.removeprefix("via").strip())
    return entries


def check_lock_matches_intent() -> None:
    """The lock the image installs says what the intent file says.

    RULE-DEP-004 checks that a lock exists and is hashed — its form. It never checked that
    the lock was compiled from the `.txt` beside it, so a bump to the intent file alone (the
    shape every Dependabot pip PR takes) passed `verify` and changed nothing in the image.
    """
    backend = ROOT / "backend"
    for lock, sources in _LOCKS.items():
        if not (backend / lock).exists() or not all((backend / s).exists() for s in sources):
            continue  # RULE-DEP-004 reports the missing file
        declared: dict[str, tuple[str, str, int, str]] = {}
        for source in sources:
            for name, (op, ver, number) in _intent(source).items():
                declared[name] = (op, ver, number, source)
        locked = _locked(lock)

        for name, (op, ver, number, source) in sorted(declared.items()):
            where = f"backend/{source}:{number}"
            if op != "==":
                drift(
                    f"{where} declares {name}{op}{ver}, not an exact pin — the intent file pins exactly"
                )
            elif name not in locked:
                drift(
                    f"{where} declares {name}=={ver}, which backend/{lock} does not contain — run `./run lock`"
                )
            elif locked[name][0] != ver:
                drift(
                    f"{where} declares {name}=={ver} but backend/{lock} installs {locked[name][0]} — "
                    "the image ships the lock, not the intent; run `./run lock`"
                )

        intent_markers = {f"-r {source}" for source in sources}
        for name, (ver, via) in sorted(locked.items()):
            if name not in declared and intent_markers & set(via):
                drift(
                    f"backend/{lock} still installs {name}=={ver} as a direct dependency, but no "
                    "intent file declares it — run `./run lock`"
                )


def main() -> int:
    check_images()
    check_python_lock()
    check_lock_matches_intent()
    for line in problems:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
