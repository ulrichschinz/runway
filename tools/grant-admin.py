"""Promote an account to admin directly, bypassing the API.

The escape hatch for an instance with no administrator. The API cannot produce that state —
`PUT /admin/users/{target}/role` refuses to demote the last admin — and a restart with
`BOOTSTRAP_ADMIN` set recovers it without this script. This exists for the cases neither
covers: a database edited by hand, an account deleted, or a host where restarting the
container is the more disruptive option.

It does not bypass the last-admin invariant in the other direction: `--role user` on the
instance's only admin is refused (exit 1), in the same serialised transaction the API uses.

`--db` has no default. This writes to a live database, and the path should be a deliberate
keystroke rather than one inherited from a config file that may point somewhere else.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

EX_OK, EX_RULE, EX_NEEDS_INPUT, EX_TOOLING = 0, 1, 2, 3

VALID_ROLES = ("admin", "user")


def _admins(con: sqlite3.Connection) -> int:
    return int(con.execute("SELECT COUNT(*) FROM users WHERE role='admin'").fetchone()[0])


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="./run grant-admin",
        description="Promote an account to admin directly in the database.",
    )
    parser.add_argument("username", help="the account to promote")
    parser.add_argument(
        "--db", required=True, metavar="PATH", help="path to users.db (no default, on purpose)"
    )
    parser.add_argument(
        "--role",
        default="admin",
        choices=VALID_ROLES,
        help="the role to set (default: admin)",
    )
    args = parser.parse_args(argv)

    path = Path(args.db)
    if not path.exists():
        print(f"  no such database: {path}", file=sys.stderr)
        return EX_TOOLING

    try:
        # isolation_level=None: this script opens its transaction itself (BEGIN IMMEDIATE).
        con = sqlite3.connect(path, isolation_level=None)
        con.row_factory = sqlite3.Row
    except sqlite3.Error as exc:
        print(f"  cannot open {path}: {exc}", file=sys.stderr)
        return EX_TOOLING

    try:
        # One serialised write transaction, as in the application (REV-002, brief 0068):
        # BEGIN IMMEDIATE takes the write lock before the read, so a request demoting someone
        # at the same moment cannot interleave with this, and the admin count is checked
        # after the write. Promotion — the escape hatch — can never fail that check.
        con.execute("BEGIN IMMEDIATE")
        had_admin = _admins(con) > 0
        row = con.execute(
            "SELECT username, role FROM users WHERE username=?", (args.username,)
        ).fetchone()
        if row is None:
            con.rollback()
            print(f"  {args.username!r} is not a registered account in {path}", file=sys.stderr)
            print("  register the account first — this script does not create users", file=sys.stderr)
            return EX_NEEDS_INPUT

        if row["role"] == args.role:
            con.rollback()
            print(f"  {args.username!r} is already {args.role!r}; nothing to do")
            return EX_OK

        con.execute("UPDATE users SET role=? WHERE username=?", (args.role, args.username))
        admins = _admins(con)
        if had_admin and admins == 0:
            con.rollback()
            print(
                f"  refusing to demote {args.username!r}: it is the last admin in {path}",
                file=sys.stderr,
            )
            print("  promote another account first", file=sys.stderr)
            return EX_RULE
        con.commit()
    finally:
        con.close()

    print(f"  {args.username!r}: {row['role'] or 'user'!r} -> {args.role!r}")
    print(f"  {admins} admin(s) in {path}")
    return EX_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
