"""Hand the backend's volumes to its unprivileged user — dry-run first, targeted, never via a link.

Run by an operator on the deploy host, inside the backend image, before the backend stops
running as uid 0 (finding SEC-003, brief 0076, ADR 0048, docs/operations.md#container-hardening):

    python /opt/runway/volume_ownership.py            # dry-run: lists what would change
    python /opt/runway/volume_ownership.py --apply    # only when the dry-run shows no anomaly

Everything under DATA_ROOT and beside DB_PATH was written by a root container, so it is owned
by root and mostly world-readable — users.db among it, which holds API keys in cleartext
(WAIVER-SEC-003). An unprivileged backend can write none of it.

This is deliberately not `chown -R`. A recursive chown run as root follows whatever it finds: a
symlink planted in an account directory hands an arbitrary host file to the service user, and a
hard link does the same without looking like a link at all. So the walk is bounded to the shape
the application creates and refuses everything else:

* two roots only — DATA_ROOT and the directory holding DB_PATH — each absolute, reached without
  a symlink, not "/" and not nested in the other;
* inside DATA_ROOT, depth two at most: account directories and the files directly in them, plus
  audit.db and its journals; inside the DB directory, the database and its journals only;
* no crossing of a device boundary (DB_PATH itself excepted: it is a bind-mounted file);
* a symlink, a hard-linked file, a FIFO, socket or device, anything deeper than expected and
  anything unexpected beside the database is an **anomaly**, reported and never touched, and any
  anomaly refuses `--apply` as a whole;
* each change opens the entry with O_NOFOLLOW and re-checks device and inode against the plan
  before fchmod/fchown, so an entry swapped after planning is refused rather than changed.

Modes become owner-only: directories 0700, files 0600 plus whatever owner execute bit they had.

Exit codes: 0 nothing to change (or applied and re-verified clean), 1 changes pending (dry-run),
2 anomalies present (nothing applied), 3 a root is unusable.

Standard library only: it runs in the runtime image, which carries no development tooling.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path

EXIT_CLEAN = 0
EXIT_PENDING = 1
EXIT_ANOMALY = 2
EXIT_USAGE = 3

DEFAULT_UID = 10001
DEFAULT_GID = 10001
DEFAULT_DATA_ROOT = "/app/data"
DEFAULT_DB_PATH = "/app/db/users.db"

SQLITE_SIDECARS = ("", "-journal", "-wal", "-shm")
AUDIT_DB = "audit.db"


class RootError(ValueError):
    """A root the tool was given cannot be used safely."""


@dataclass(frozen=True)
class Change:
    path: str
    kind: str
    dev: int
    ino: int
    old_uid: int
    old_gid: int
    old_mode: int
    new_uid: int
    new_gid: int
    new_mode: int


@dataclass(frozen=True)
class Anomaly:
    path: str
    reason: str


@dataclass
class Plan:
    uid: int
    gid: int
    changes: list[Change] = field(default_factory=list)
    anomalies: list[Anomaly] = field(default_factory=list)


def _check_root(path: Path, label: str) -> Path:
    if not path.is_absolute():
        raise RootError(f"{label} {path} is not absolute")
    if path == Path(path.anchor):
        raise RootError(f"{label} is the filesystem root")
    if os.path.realpath(path) != os.path.normpath(path):
        raise RootError(f"{label} {path} is reached through a symlink ({os.path.realpath(path)})")
    try:
        st = os.lstat(path)
    except FileNotFoundError as error:
        raise RootError(f"{label} {path} does not exist") from error
    if not stat.S_ISDIR(st.st_mode):
        raise RootError(f"{label} {path} is not a directory")
    return path


def _target_mode(st: os.stat_result) -> int:
    owner = stat.S_IMODE(st.st_mode) & 0o700
    return 0o700 if stat.S_ISDIR(st.st_mode) else owner | 0o600


def _consider(plan: Plan, path: Path, st: os.stat_result, kind: str) -> None:
    new_mode = _target_mode(st)
    old_mode = stat.S_IMODE(st.st_mode)
    if (st.st_uid, st.st_gid, old_mode) != (plan.uid, plan.gid, new_mode):
        plan.changes.append(
            Change(
                str(path),
                kind,
                st.st_dev,
                st.st_ino,
                st.st_uid,
                st.st_gid,
                old_mode,
                plan.uid,
                plan.gid,
                new_mode,
            )
        )


def _entry(plan: Plan, path: Path, root_dev: int, *, allow_dir: bool, exempt_dev: bool = False):
    """lstat one entry and decide whether it is ours to change. Returns its stat or None."""
    st = os.lstat(path)
    mode = st.st_mode
    if stat.S_ISLNK(mode):
        plan.anomalies.append(Anomaly(str(path), "symlink — never followed, never changed"))
        return None
    if not exempt_dev and st.st_dev != root_dev:
        plan.anomalies.append(Anomaly(str(path), "on another device — a mount inside the root"))
        return None
    if stat.S_ISDIR(mode):
        if not allow_dir:
            plan.anomalies.append(Anomaly(str(path), "directory deeper than expected"))
            return None
        return st
    if not stat.S_ISREG(mode):
        plan.anomalies.append(Anomaly(str(path), "not a regular file (FIFO, socket or device)"))
        return None
    if st.st_nlink > 1:
        plan.anomalies.append(
            Anomaly(str(path), f"hard link ({st.st_nlink} names) — may be a file outside the root")
        )
        return None
    return st


def plan(data_root: Path, db_path: Path, uid: int, gid: int) -> Plan:
    data_root = _check_root(Path(data_root), "DATA_ROOT")
    db_path = Path(db_path)
    db_dir = _check_root(db_path.parent, "the DB_PATH directory")
    for a, b in ((data_root, db_dir), (db_dir, data_root)):
        if a == b or b.is_relative_to(a):
            raise RootError(f"{b} lies inside {a}; the two roots must be disjoint")

    result = Plan(uid=uid, gid=gid)

    # DATA_ROOT: the root, account directories and their files, audit.db and its journals.
    root_dev = os.lstat(data_root).st_dev
    _consider(result, data_root, os.lstat(data_root), "dir")
    for child in sorted(data_root.iterdir()):
        st = _entry(result, child, root_dev, allow_dir=True)
        if st is None:
            continue
        if not stat.S_ISDIR(st.st_mode):
            _consider(result, child, st, "file")
            continue
        _consider(result, child, st, "dir")
        for grandchild in sorted(child.iterdir()):
            gst = _entry(result, grandchild, root_dev, allow_dir=False)
            if gst is not None:
                _consider(result, grandchild, gst, "file")

    # The DB directory: the database and its SQLite sidecars, nothing else.
    db_dev = os.lstat(db_dir).st_dev
    _consider(result, db_dir, os.lstat(db_dir), "dir")
    expected = {db_path.name + suffix for suffix in SQLITE_SIDECARS}
    for child in sorted(db_dir.iterdir()):
        if child.name not in expected:
            result.anomalies.append(Anomaly(str(child), "unexpected beside the database"))
            continue
        st = _entry(result, child, db_dev, allow_dir=False, exempt_dev=child == db_path)
        if st is not None:
            _consider(result, child, st, "file")

    return result


def apply(result: Plan) -> list[str]:
    """Carry out a plan. Returns one message per entry that could not be changed."""
    if result.anomalies:
        return [f"{a.path}: {a.reason}" for a in result.anomalies]
    errors: list[str] = []
    for change in result.changes:
        flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
        if change.kind == "dir":
            flags |= os.O_DIRECTORY
        try:
            fd = os.open(change.path, flags)
        except OSError as error:
            errors.append(f"{change.path}: cannot open without following links ({error})")
            continue
        try:
            st = os.fstat(fd)
            if (st.st_dev, st.st_ino) != (change.dev, change.ino):
                errors.append(f"{change.path}: replaced since the plan was made — not changed")
                continue
            os.fchmod(fd, change.new_mode)
            os.fchown(fd, change.new_uid, change.new_gid)
        except OSError as error:
            errors.append(f"{change.path}: {error}")
        finally:
            os.close(fd)
    return errors


def _describe(change: Change) -> str:
    return (
        f"  {change.kind:4} {change.path}  "
        f"{change.old_uid}:{change.old_gid} {change.old_mode:04o} -> "
        f"{change.new_uid}:{change.new_gid} {change.new_mode:04o}"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--data-root", default=os.environ.get("DATA_ROOT", DEFAULT_DATA_ROOT))
    parser.add_argument("--db-path", default=os.environ.get("DB_PATH", DEFAULT_DB_PATH))
    parser.add_argument("--uid", type=int, default=DEFAULT_UID)
    parser.add_argument("--gid", type=int, default=DEFAULT_GID)
    parser.add_argument("--apply", action="store_true", help="change what the dry-run lists")
    parser.add_argument("--json", action="store_true", help="one JSON document on stdout")
    args = parser.parse_args(argv)
    mode = "apply" if args.apply else "dry-run"

    def emit(doc: dict, lines: list[str]) -> None:
        if args.json:
            print(json.dumps(doc, indent=2, sort_keys=True))
        else:
            print("\n".join(lines))

    try:
        result = plan(Path(args.data_root), Path(args.db_path), args.uid, args.gid)
    except (RootError, OSError) as error:
        emit({"mode": mode, "error": str(error)}, [f"volume_ownership: {error}"])
        return EXIT_USAGE

    doc = {
        "mode": mode,
        "target": f"{args.uid}:{args.gid}",
        "data_root": args.data_root,
        "db_path": args.db_path,
        "changes": [asdict(c) for c in result.changes],
        "anomalies": [asdict(a) for a in result.anomalies],
    }
    lines = [f"volume_ownership {mode}: target {args.uid}:{args.gid}"]
    lines += [_describe(c) for c in result.changes]
    lines += [f"  ANOMALY {a.path}: {a.reason}" for a in result.anomalies]
    lines.append(f"{len(result.changes)} change(s), {len(result.anomalies)} anomaly(ies)")

    if result.anomalies:
        lines.append("refusing to apply anything until every anomaly is resolved by hand")
        emit(doc, lines)
        return EXIT_ANOMALY
    if not args.apply:
        emit(doc, lines)
        return EXIT_PENDING if result.changes else EXIT_CLEAN

    errors = apply(result)
    after = plan(Path(args.data_root), Path(args.db_path), args.uid, args.gid)
    doc["errors"] = errors
    doc["remaining"] = len(after.changes) + len(after.anomalies)
    lines += [f"  ERROR {e}" for e in errors]
    lines.append(f"re-verified: {doc['remaining']} entry(ies) still differ")
    emit(doc, lines)
    if errors or after.anomalies:
        return EXIT_ANOMALY
    return EXIT_PENDING if after.changes else EXIT_CLEAN


if __name__ == "__main__":
    sys.exit(main())
