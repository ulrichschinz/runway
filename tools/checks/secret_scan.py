"""Look for credentials that have been committed.

Emits `RULE-ID|message` lines; `tools/checks/secrets.sh` turns them into gate failures.

`RULE-HYG-001` keeps secret-*bearing paths* out of git and `RULE-HYG-003` keeps literals out
of the deployment compose. Neither catches the ordinary case: a key pasted into a source file,
a test fixture, or a documentation example, in a file that legitimately belongs in the
repository. This is a public repository, so a committed credential is disclosed the moment it
is pushed — rotation, not deletion, is the remedy, and the cheapest moment to catch it is
before the push.

**Scoped to tracked files.** An untracked scratch file is not disclosed, and scanning the
working tree would flag every developer's local `.env` on a rule they cannot fix by editing
code.

Pattern-based, so it is bounded on both sides: it catches shapes with distinctive prefixes and
high-entropy assignments, and it will miss a credential that looks like ordinary prose. That
limit is recorded rather than implied — see `RISK-DEP-002`.
"""

from __future__ import annotations

import math
import re
import subprocess  # noqa: S404  # tooling: reads the tracked-file list
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Provider-issued credentials, which carry their own unambiguous prefixes. A hit here is very
# unlikely to be a false positive, which is why these are reported regardless of entropy.
KNOWN_SHAPES = [
    ("AWS access key id", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("GitLab token", re.compile(r"\bglpat-[A-Za-z0-9_\-]{20,}\b")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}\b")),
    ("Stripe key", re.compile(r"\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b")),
    ("OpenAI key", re.compile(r"\bsk-[A-Za-z0-9]{32,}\b")),
    ("Anthropic key", re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{20,}\b")),
    ("private key block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----")),
    ("JSON web token", re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b")),
]

# A credential-shaped assignment. Entropy decides whether it is real, because this pattern on
# its own matches every `password = "changeme"` in a test.
ASSIGNMENT = re.compile(
    r"""(?ix)
    \b(?P<name>[A-Za-z_][A-Za-z0-9_]*(?:secret|token|passwd|password|api[_-]?key|access[_-]?key|private[_-]?key)[A-Za-z0-9_]*)
    \s*[:=]\s*
    ['"](?P<value>[^'"\n]{16,})['"]
    """
)

MIN_ENTROPY_BITS = 3.4
SKIP_SUFFIXES = (".lock", ".svg", ".png", ".jpg", ".ico", ".woff", ".woff2")
SKIP_PREFIXES = ("ops/surfaces/", "index/")

problems: list[str] = []


def shannon_entropy(value: str) -> float:
    if not value:
        return 0.0
    return -sum(
        (count / len(value)) * math.log2(count / len(value))
        for count in (value.count(c) for c in set(value))
    )


def looks_generated(value: str) -> bool:
    """A placeholder, a template reference, or a hash — not a credential."""
    lowered = value.lower()
    if value.startswith("${") or value.startswith("$(") or "{{" in value:
        return True
    if any(word in lowered for word in ("example", "changeme", "placeholder", "your-", "xxx", "dummy", "sample", "fake", "test")):
        return True
    if re.fullmatch(r"(?:sha256[:-])?[0-9a-f]{32,}", lowered):
        return True  # a digest, and digests are meant to be published
    return False


def tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    return [
        rel
        for rel in out
        if not rel.endswith(SKIP_SUFFIXES) and not rel.startswith(SKIP_PREFIXES)
    ]


def scan(rel: str) -> None:
    path = ROOT / rel
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return  # binary or unreadable: nothing a pattern scan can say about it

    for number, line in enumerate(text.splitlines(), start=1):
        if "secret-scan: allow" in line:
            continue  # an explicit, reviewable per-line exemption

        for label, pattern in KNOWN_SHAPES:
            if pattern.search(line):
                problems.append(
                    f"RULE-DEP-003|{rel}:{number} looks like a committed {label}. This "
                    "repository is public: treat it as disclosed and rotate it, then remove it"
                )
                return

        match = ASSIGNMENT.search(line)
        if match:
            value = match.group("value")
            if looks_generated(value):
                continue
            if shannon_entropy(value) >= MIN_ENTROPY_BITS:
                problems.append(
                    f"RULE-DEP-003|{rel}:{number} assigns a high-entropy value to "
                    f"{match.group('name')!r}. If it is a credential, rotate it; if it is not, "
                    "append `secret-scan: allow` to the line with a reason"
                )
                return


def main() -> int:
    for rel in tracked_files():
        scan(rel)
    for line in problems:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
