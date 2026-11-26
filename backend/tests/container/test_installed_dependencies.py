"""The image installs its lock — every package at exactly the locked version (brief 0072, plan §6).

A lock that names a fixed version is not evidence that the process runs it. This runs inside the test
image, which installs `requirements-dev.lock` with `--require-hashes` from the same base as the runtime
image (`requirements.lock`); `RULE-DEP-005` holds both locks to the same intent. No Taskwarrior needed.
"""

from __future__ import annotations

import re
from importlib import metadata
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
_PIN = re.compile(r"^([A-Za-z0-9_.\-]+)(?:\[[^\]]*\])?==([^\s\\;]+)", re.MULTILINE)

# CVE-2024-53981 and every later advisory OSV listed for python-multipart on 2026-11-25 (brief 0072).
MULTIPART_FIXED = (0, 0, 31)


def _locked() -> dict[str, str]:
    text = (BACKEND / "requirements-dev.lock").read_text(encoding="utf-8")
    return {re.sub(r"[-_.]+", "-", m.group(1)).lower(): m.group(2) for m in _PIN.finditer(text)}


def test_every_locked_package_is_installed_at_its_locked_version():
    locked = _locked()
    assert len(locked) > 30  # a guard on the guard: an unreadable lock would make this vacuous
    wrong = {}
    for name, version in locked.items():
        try:
            installed = metadata.version(name)
        except metadata.PackageNotFoundError:
            installed = None
        if installed != version:
            wrong[name] = (version, installed)
    assert not wrong, f"locked vs installed: {wrong}"


def test_the_installed_multipart_parser_is_fixed():
    installed = tuple(int(p) for p in re.findall(r"\d+", metadata.version("python-multipart"))[:3])
    assert installed >= MULTIPART_FIXED
