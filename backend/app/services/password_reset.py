"""The operator reset of one account's password (finding SEC-006, brief 0067, docs/operations.md).

The recovery path for an account whose bcrypt-era password of 72 bytes or more is refused after
Switch 2, and for any account still on bcrypt at the contract step. Run inside the container, on a
terminal, after the person has been confirmed out of band:

    docker compose exec -it backend python -m app.services.password_reset <account>

The temporary password is read twice with `getpass` from the terminal — never from the command
line, so it reaches no shell history and no process list. It passes the same rule as a password
change (the byte policy and, during the soak, the 72-byte limit), is hashed for the current phase
(`hash_for`: bcrypt during the soak, so a rollback can still verify it; Argon2id after), and is
written together with `auth_version + 1` in one statement: every session of the account ends.
The API key is untouched. `auth.password.changed` is recorded with actor `operator`.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sqlite3
import sys
import time
from pathlib import Path

from app import audit, database
from app.auth import hash_for, kdf_phase, new_password_problem, password_problem
from app.config import settings

EX_OK, EX_REFUSED, EX_USAGE, EX_TOOLING = 0, 1, 2, 3


async def _reset(username: str, temporary: str) -> int:
    async with database.users_connection() as db:
        phase = kdf_phase(await database.get_password_kdf_expand_at(db), time.time())
        problem = new_password_problem(phase, temporary)
        if problem:
            sys.stderr.write(f"  refused: {problem}\n")
            return EX_USAGE
        version = await database.reset_password(db, username, hash_for(phase, temporary))
    if version is None:
        sys.stderr.write("  no such account; nothing changed\n")
        return EX_REFUSED
    audit.record(
        audit.PASSWORD_CHANGED,
        outcome=audit.SUCCESS,
        actor="operator",
        subject=username,
        route="cli:password_reset",
        detail=f"operator reset; every earlier session ended (auth_version {version})",
    )
    sys.stdout.write(f"  {username}: password reset, every session ended\n")
    return EX_OK


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.services.password_reset",
        description="Set a temporary password for one account and end all its sessions.",
    )
    parser.add_argument("account", help="the username")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exit_:
        return EX_OK if exit_.code == 0 else EX_USAGE
    if not Path(settings.db_path).exists():
        sys.stderr.write("  the users database does not exist\n")
        return EX_TOOLING
    try:
        temporary = getpass.getpass("temporary password (8-1024 bytes): ")
        again = getpass.getpass("again: ")
    except (EOFError, KeyboardInterrupt):
        sys.stderr.write("  no password read; run it on a terminal (docker compose exec -it)\n")
        return EX_USAGE
    if temporary != again:
        sys.stderr.write("  the two entries differ; nothing changed\n")
        return EX_USAGE
    problem = password_problem(temporary, new=True)
    if problem:
        sys.stderr.write(f"  refused: {problem}\n")
        return EX_USAGE
    try:
        return asyncio.run(_reset(args.account, temporary))
    except sqlite3.Error as failure:
        sys.stderr.write(f"  cannot run: {type(failure).__name__}\n")
        return EX_TOOLING


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
