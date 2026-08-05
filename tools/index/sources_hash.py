"""Print the sha256 over the contents of every tracked file.

Shared by the builder and the freshness check so the two cannot disagree about what
"unchanged" means.
"""

import hashlib
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def sources_hash() -> str:
    files = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    digest = hashlib.sha256()
    for rel in sorted(files):
        path = ROOT / rel
        if not path.is_file():
            continue
        digest.update(rel.encode())
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


if __name__ == "__main__":
    print(sources_hash())
