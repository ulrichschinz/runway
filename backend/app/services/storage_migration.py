"""Operator CLI: move accounts from `DATA_ROOT/<username>/` to `DATA_ROOT/<storage_id>/`.

Finding SEC-001, milestone M1.2, ADR 0043. Run inside the backend image, with the backend
**stopped** so nothing writes a store while it is copied::

    docker compose stop backend
    docker compose run --rm --no-deps backend python -m app.services.storage_migration plan
    docker compose run --rm --no-deps backend python -m app.services.storage_migration apply
    docker compose start backend

Three commands:

``plan``      the dry run. Changes nothing. One line per account: its id, its storage id, the
              legacy and the target path *relative to DATA_ROOT*, a status and counts. No task
              text, no credential, nothing read out of a store but sizes and digests.
``apply``     migrates every account ``plan`` calls ``ready`` or ``provision``. Idempotent: an
              account already ``done`` is skipped, and a run interrupted between the rename and
              the database update is completed by the next one.
``rollback``  ``--user-id N``: returns one migrated account to its legacy directory, but only
              while the new store is byte-for-byte what was copied, and only in ``compat``
              mode. After a write it refuses; the way back is then the backup or a forward
              fix. The copy it no longer serves is renamed to ``.<id>.rolled-back.<stamp>``,
              so a later ``apply`` copies the legacy store afresh.

**What a copy must survive before it counts.** Source, target, owner, type and collisions are
checked first, and each of these stops that account, visibly, with nothing moved: a name that
is not one path component; two accounts whose directories are the same directory — the same
inode, however the names are spelled, so `Alice` and `alice` on a case-insensitive filesystem
count (an alias: treat as a possible incident); a name the filesystem only reaches by folding it
onto a differently spelled directory; a symlink, a hard-linked file, a device, FIFO or socket anywhere
in the tree; an entry not owned by the service user; a target that already exists with
different content. The copy is assembled in a staging directory, verified against a manifest
of every file's size and SHA-256, and renamed into place on the same filesystem. **The source is
never modified or removed** — removing it is the contract step, a separate change after the
rollback window (see the brief).

Exit codes, as `./run` uses them: 0 every account is fine, 1 at least one is blocked or refused,
2 bad usage, 3 the database or the data root cannot be opened.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import shutil
import sqlite3
import stat
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from app import audit, database, task_storage
from app.config import settings
from app.services.user_service import provision_store
from app.task_storage import LAYOUT_LEGACY, LAYOUT_STORAGE_ID, Account, StorageRefused

EX_OK, EX_BLOCKED, EX_USAGE, EX_TOOLING = 0, 1, 2, 3

# Statuses. `done`, `ready` and `provision` are what `plan` reports; `apply` turns the last two
# into `migrated` and `provisioned`, and anything it could not finish into `blocked`.
DONE = "done"
READY = "ready"
PROVISION = "provision"
BLOCKED = "blocked"
MIGRATED = "migrated"
PROVISIONED = "provisioned"
ROLLED_BACK = "rolled_back"

_CHUNK = 1 << 20


@dataclass
class Entry:
    user_id: int
    storage_id: str
    legacy_path: str
    target_path: str
    status: str
    reason: str = ""
    files: int = 0
    bytes: int = 0


@dataclass(frozen=True)
class Manifest:
    files: int
    bytes: int
    digest: str


class Blocked(Exception):
    """One account cannot be moved. `reason` is a fixed phrase, never a path."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


# --- reading a tree ------------------------------------------------------------------------


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _check_entry(info: os.stat_result, uid: int) -> None:
    if stat.S_ISLNK(info.st_mode):
        raise Blocked("tree contains a symlink")
    if info.st_uid != uid:
        raise Blocked("tree contains an entry not owned by the service user")
    if stat.S_ISDIR(info.st_mode):
        return
    if not stat.S_ISREG(info.st_mode):
        raise Blocked("tree contains a device, FIFO or socket")
    if info.st_nlink > 1:
        raise Blocked("tree contains a hard-linked file")


def manifest(root: Path) -> Manifest:
    """Every regular file under `root` — path, size, SHA-256 — folded into one digest.

    Walks without following links and checks every entry with `lstat`, so a tree that is not
    plain directories and plain files owned by this process raises `Blocked` instead of being
    copied. Empty directories are part of the digest, so a copy that drops one is a mismatch.
    """
    uid = os.geteuid()
    _check_entry(root.lstat(), uid)
    rows: list[list[object]] = []
    total = 0
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        here = Path(dirpath)
        for name in sorted(dirnames):
            _check_entry((here / name).lstat(), uid)
            rows.append(["d", (here / name).relative_to(root).as_posix()])
        for name in sorted(filenames):
            path = here / name
            info = path.lstat()
            _check_entry(info, uid)
            rows.append(["f", path.relative_to(root).as_posix(), info.st_size, _sha256(path)])
            total += info.st_size
    rows.sort(key=lambda row: str(row[1]))
    digest = hashlib.sha256(json.dumps(rows, separators=(",", ":")).encode()).hexdigest()
    return Manifest(files=sum(1 for row in rows if row[0] == "f"), bytes=total, digest=digest)


# --- planning ------------------------------------------------------------------------------


def _aliases(accounts: list[Account]) -> set[int]:
    """Ids of legacy accounts whose raw `DATA_ROOT/<name>` is a directory another account uses.

    Computed from the name as the old code used it — joined verbatim and opened by the OS —
    because that is the directory the account has actually been writing to, and compared by
    **inode**, not by spelling: `alice/../alice` lands in `alice`, and on a case- or
    normalisation-insensitive filesystem (APFS, a Docker Desktop bind mount) so do `ALICE` and
    the NFD spelling of an NFC name, although every one of those strings differs. A legacy name
    that is another account's storage id, or whose directory is one, counts too.

    Every legacy member of such a group is blocked, the legitimate owner included: an alias
    account may already have written into that store, and deciding whose it is needs a human.
    """
    legacy = {a.id for a in accounts if a.storage_layout == LAYOUT_LEGACY}
    storage_ids = {a.storage_id: a.id for a in accounts}
    groups: dict[tuple[int, int], set[int]] = {}
    flagged: set[int] = set()
    for account in accounts:
        if account.id in legacy:
            owner = storage_ids.get(account.username)
            if owner is not None and owner != account.id:
                flagged.add(account.id)
            landed = task_storage.legacy_identity(account.username)
            if landed is not None:
                groups.setdefault(landed, set()).add(account.id)
        store = task_storage.store_identity(account.storage_id)
        if store is not None:
            groups.setdefault(store, set()).add(account.id)
    for ids in groups.values():
        if len(ids) > 1:
            flagged |= ids
    return flagged & legacy


def _legacy_text(account: Account) -> str:
    """The legacy path relative to DATA_ROOT, escaped so a control character cannot reach a
    terminal; for a name that is not one component, a placeholder instead of the name."""
    try:
        task_storage.legacy_dir(account.username, allow_storage_id_shape=True)
    except StorageRefused:
        return "<not a single path component>"
    return account.username.encode("unicode_escape").decode("ascii")


def _plan_one(
    account: Account, aliased: set[int], copied_before: str | None = None
) -> tuple[Entry, Manifest | None, bool]:
    """One account's entry, the manifest to copy against, and whether an existing target is a
    stale copy this tool made and a rollback left behind (`copied_before` is the manifest of
    the last migration when the account's latest action is a rollback)."""
    storage_id = account.storage_id
    entry = Entry(account.id, storage_id, _legacy_text(account), storage_id or "-", BLOCKED)
    try:
        target = task_storage.storage_dir(storage_id)
    except StorageRefused:
        entry.reason = "no valid storage id; start the service once to backfill it"
        return entry, None, False

    if account.storage_layout == LAYOUT_STORAGE_ID:
        try:
            task_storage.checked_directory(target)
        except StorageRefused as refused:
            entry.reason = refused.reason
            return entry, None, False
        entry.status = DONE
        return entry, None, False

    if account.id in aliased:
        entry.reason = "alias of another account's directory"
        return entry, None, False
    try:
        source = task_storage.legacy_dir(account.username, allow_storage_id_shape=True)
    except StorageRefused as refused:
        entry.reason = refused.reason
        return entry, None, False

    if not os.path.lexists(source):
        if os.path.lexists(target):
            entry.reason = "target exists and there is no source"
            return entry, None, False
        entry.status = PROVISION
        return entry, None, False

    try:
        task_storage.checked_legacy_directory(source)
        found = manifest(source)
    except (StorageRefused, Blocked) as refused:
        entry.reason = refused.reason
        return entry, None, False
    entry.files, entry.bytes = found.files, found.bytes

    stale = False
    if os.path.lexists(target):
        # Resume after an interrupted apply: the rename happened, the database update did not.
        # Or a rollback flipped the account back but left the copy it made in place: then the
        # target is still exactly what the last migration recorded, and is replaced.
        try:
            existing: Manifest | None = manifest(task_storage.checked_directory(target))
        except (StorageRefused, Blocked):
            existing = None
        stale = (
            existing is not None
            and copied_before is not None
            and existing.digest == copied_before
            and existing != found
        )
        if existing != found and not stale:
            entry.reason = "target exists with different content"
            return entry, None, False
    entry.status = READY
    return entry, found, stale


async def plan(db) -> list[tuple[Account, Entry, Manifest | None, bool]]:
    accounts = await database.list_accounts(db)
    aliased = _aliases(accounts)
    planned = []
    for account in accounts:
        copied_before = None
        if await database.last_storage_action(db, account.id) == ROLLED_BACK:
            copied_before = await database.last_migration_manifest(db, account.id)
        planned.append((account, *_plan_one(account, aliased, copied_before)))
    return planned


# --- applying ------------------------------------------------------------------------------


def _stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")


def _set_aside(storage_id: str) -> None:
    """Rename `DATA_ROOT/<storage_id>` out of the way. Kept, never deleted: removing it is the
    contract step's business, like the legacy sources."""
    aside = task_storage.set_aside_dir(storage_id, _stamp())
    if os.path.lexists(aside):
        raise Blocked("set-aside path already exists")
    os.rename(task_storage.storage_dir(storage_id), aside)


def _copy(source: Path, storage_id: str, expected: Manifest, stale: bool = False) -> Path:
    """Copy `source` into place under `storage_id`; return the target. Raises `Blocked`."""
    target = task_storage.storage_dir(storage_id)
    if stale and os.path.lexists(target):
        _set_aside(storage_id)  # verified by the plan to be this tool's own earlier copy
    if os.path.lexists(target):
        return target  # verified identical by the plan
    staging = task_storage.staging_dir(storage_id)
    if os.path.lexists(staging):
        if not stat.S_ISDIR(staging.lstat().st_mode):
            raise Blocked("staging path exists and is not a directory")
        shutil.rmtree(staging)
    shutil.copytree(source, staging, symlinks=True, copy_function=shutil.copy2)
    try:
        copied = manifest(staging)
    except Blocked:
        copied = None
    if copied != expected:
        shutil.rmtree(staging, ignore_errors=True)
        raise Blocked("copy did not verify against the source manifest")
    if os.path.lexists(target):
        shutil.rmtree(staging, ignore_errors=True)
        raise Blocked("target appeared during the copy")
    os.rename(staging, target)
    return target


async def apply(db, user_id: int | None = None) -> list[Entry]:
    results: list[Entry] = []
    for account, entry, found, stale in await plan(db):
        if user_id is not None and account.id != user_id:
            continue
        if entry.status == PROVISION:
            try:
                provision_store(account)
            except (OSError, StorageRefused) as failure:
                entry.status, entry.reason = (
                    BLOCKED,
                    f"could not provision: {type(failure).__name__}",
                )
            else:
                await database.set_storage_layout(db, account.id, LAYOUT_STORAGE_ID)
                await database.record_storage_migration(
                    db, account, legacy_path=entry.legacy_path, action="provisioned"
                )
                entry.status = PROVISIONED
        elif entry.status == READY and found is not None:
            source = task_storage.legacy_dir(account.username, allow_storage_id_shape=True)
            try:
                target = _copy(source, account.storage_id, found, stale)
                if manifest(target) != found or manifest(source) != found:
                    raise Blocked("source changed during the copy; stop the backend and retry")
            except Blocked as blocked:
                entry.status, entry.reason = BLOCKED, blocked.reason
            else:
                await database.set_storage_layout(db, account.id, LAYOUT_STORAGE_ID)
                await database.record_storage_migration(
                    db,
                    account,
                    legacy_path=entry.legacy_path,
                    action="migrated",
                    files=found.files,
                    size=found.bytes,
                    manifest=found.digest,
                )
                audit.record(
                    audit.STORAGE_MIGRATED,
                    outcome=audit.SUCCESS,
                    actor="operator",
                    subject=f"user:{account.id}",
                    detail=f"{found.files} files",
                )
                entry.status = MIGRATED
        if entry.status == BLOCKED:
            await database.record_storage_migration(
                db, account, legacy_path=entry.legacy_path, action="blocked", reason=entry.reason
            )
        results.append(entry)
    return results


async def rollback(db, user_id: int) -> Entry:
    accounts = {a.id: a for a in await database.list_accounts(db)}
    account = accounts.get(user_id)
    if account is None:
        return Entry(user_id, "-", "-", "-", BLOCKED, "no such account")
    entry = Entry(
        account.id, account.storage_id, _legacy_text(account), account.storage_id, BLOCKED
    )
    if account.storage_layout != LAYOUT_STORAGE_ID:
        entry.reason = "account is not migrated"
        return entry
    if task_storage.storage_mode() != task_storage.MODE_COMPAT:
        # In strict mode a legacy account is refused, so this would turn a working account into
        # a 500 at once. Set TASK_STORAGE_MODE=compat first, deliberately.
        entry.reason = "rollback needs TASK_STORAGE_MODE=compat; strict refuses a legacy account"
        return entry
    recorded = await database.last_migration_manifest(db, account.id)
    if recorded is None:
        entry.reason = "account was not migrated by this tool; it has no legacy source"
        return entry
    try:
        source = task_storage.checked_legacy_directory(
            task_storage.legacy_dir(account.username, allow_storage_id_shape=True)
        )
        now = manifest(task_storage.checked_directory(task_storage.storage_dir(account.storage_id)))
        manifest(source)
    except (StorageRefused, Blocked) as refused:
        entry.reason = refused.reason
        return entry
    if now.digest != recorded:
        entry.reason = "the new store has been written to since the migration; restore instead"
        return entry
    await database.set_storage_layout(db, account.id, LAYOUT_LEGACY)
    await database.record_storage_migration(
        db, account, legacy_path=entry.legacy_path, action="rolled_back"
    )
    # After the flip, so a failure here costs nothing but a stale copy — which the next `plan`
    # recognises by the recorded manifest and replaces.
    try:
        _set_aside(account.storage_id)
    except (OSError, Blocked):
        entry.reason = "rolled back; the copy stays in place and the next apply replaces it"
    audit.record(
        audit.STORAGE_ROLLED_BACK,
        outcome=audit.SUCCESS,
        actor="operator",
        subject=f"user:{account.id}",
    )
    entry.status, entry.files, entry.bytes = ROLLED_BACK, now.files, now.bytes
    return entry


# --- the command line ----------------------------------------------------------------------


def _emit(entries: list[Entry], as_json: bool) -> None:
    out = sys.stdout
    if as_json:
        out.write(json.dumps([asdict(e) for e in entries], ensure_ascii=True) + "\n")
        return
    for e in entries:
        reason = f"  ({e.reason})" if e.reason else ""
        out.write(
            f"  user {e.user_id:>5}  {e.status:<11} {e.files:>6} files {e.bytes:>12} bytes"
            f"  {e.legacy_path} -> {e.target_path}{reason}\n"
        )
    counts: dict[str, int] = {}
    for e in entries:
        counts[e.status] = counts.get(e.status, 0) + 1
    summary = ", ".join(f"{n} {status}" for status, n in sorted(counts.items())) or "no accounts"
    out.write(f"  {summary}\n")


async def _main(args: argparse.Namespace) -> int:
    async with database.users_connection() as db:
        if args.command == "plan":
            entries = [entry for _account, entry, _found, _stale in await plan(db)]
        elif args.command == "apply":
            entries = await apply(db, args.user_id)
        else:
            entries = [await rollback(db, args.user_id)]
    _emit(entries, args.json)
    return EX_BLOCKED if any(e.status == BLOCKED for e in entries) else EX_OK


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.services.storage_migration",
        description="Move Taskwarrior stores from DATA_ROOT/<username> to DATA_ROOT/<storage_id>.",
    )
    parser.add_argument("command", choices=("plan", "apply", "rollback"))
    parser.add_argument("--user-id", type=int, default=None, help="limit to one account")
    parser.add_argument("--json", action="store_true", help="one JSON document on stdout")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exit_:
        return EX_OK if exit_.code == 0 else EX_USAGE
    if args.command == "rollback" and args.user_id is None:
        sys.stderr.write("  rollback needs --user-id\n")
        return EX_USAGE
    if not Path(settings.db_path).exists():
        sys.stderr.write("  the users database does not exist\n")
        return EX_TOOLING
    try:
        return asyncio.run(_main(args))
    except (sqlite3.Error, OSError) as failure:
        sys.stderr.write(f"  cannot run: {type(failure).__name__}: {failure}\n")
        return EX_TOOLING


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
