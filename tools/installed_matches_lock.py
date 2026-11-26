"""Does this interpreter run the closure its lock names? Stdlib only, so it runs in the runtime image.

    docker run --rm -i <backend image> python - /app/requirements.lock < tools/installed_matches_lock.py

deploy.yml runs exactly that against the pushed backend image before the deploy job may start: the
runtime image installs `requirements.lock`, the container tier's test image installs
`requirements-dev.lock`, so without this nothing automated looks at what ships (plan §6, "Ein
aktualisierter Lock beweist nicht, dass das Image ihn installiert"; brief 0072, review round 1).

Exit 0 and `ok: …` when every pin of the lock is installed at exactly its version, python-multipart is
past its last known advisory and python-jose (and its unfixed `ecdsa`) cannot be imported. Exit 1 with
the list otherwise. Prints package names and versions only.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from importlib import metadata
from pathlib import Path

_PIN = re.compile(r"^([A-Za-z0-9_.\-]+)(?:\[[^\]]*\])?==([^\s\;]+)", re.MULTILINE)

# CVE-2024-53981's first fix is 0.0.18; 0.0.31 fixes every later advisory OSV listed on 2026-11-25.
MULTIPART_FIXED = (0, 0, 31)
# Removed by brief 0072: python-jose has no fixed release for its CVEs, ecdsa none for Minerva.
MUST_NOT_IMPORT = ("jose", "ecdsa")
# A lock this short was not read correctly; an empty comparison must not pass.
MINIMUM_PINS = 20


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _version(text: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.findall(r"\d+", text)[:3])


def problems(lock: Path) -> list[str]:
    try:
        text = lock.read_text(encoding="utf-8")
    except OSError as error:
        return [f"cannot read {lock}: {error.strerror}"]
    locked = {_norm(m.group(1)): m.group(2) for m in _PIN.finditer(text)}
    if len(locked) < MINIMUM_PINS:
        return [f"{lock} names {len(locked)} pins; at least {MINIMUM_PINS} expected"]

    found = []
    for name, version in sorted(locked.items()):
        try:
            installed = metadata.version(name)
        except metadata.PackageNotFoundError:
            installed = "not installed"
        if installed != version:
            found.append(f"{name}: locked {version}, installed {installed}")
    try:
        multipart = metadata.version("python-multipart")
    except metadata.PackageNotFoundError:
        multipart = None
    if multipart is not None and _version(multipart) < MULTIPART_FIXED:
        found.append(f"python-multipart {multipart} is below {'.'.join(map(str, MULTIPART_FIXED))}")
    for module in MUST_NOT_IMPORT:
        if importlib.util.find_spec(module) is not None:
            found.append(f"{module} is importable")
    return found


def main(argv: list[str]) -> int:
    lock = Path(argv[1] if len(argv) > 1 else "/app/requirements.lock")
    found = problems(lock)
    if found:
        sys.stderr.write("installed closure differs from the lock:\n")
        sys.stderr.writelines(f"  {line}\n" for line in found)
        return 1
    sys.stdout.write(f"ok: every pin of {lock.name} is installed at its version\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
