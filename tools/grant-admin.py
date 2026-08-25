"""Promote an account to admin directly, bypassing the API.

The escape hatch for an instance with no administrator. The API cannot produce that state —
`PUT /admin/users/{target}/role` refuses to demote the last admin — and a restart with
`BOOTSTRAP_ADMIN` set recovers it without this script. This exists for the cases neither
covers: a database edited by hand, an account deleted, or a host where restarting the
container is the more disruptive option.

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
        con = sqlite3.connect(path)
        con.row_factory = sqlite3.Row
    except sqlite3.Error as exc:
        print(f"  cannot open {path}: {exc}", file=sys.stderr)
        return EX_TOOLING

    try:
        row = con.execute(
            "SELECT username, role FROM users WHERE username=?", (args.username,)
        ).fetchone()
        if row is None:
            print(f"  {args.username!r} is not a registered account in {path}", file=sys.stderr)
            print("  register the account first — this script does not create users", file=sys.stderr)
            return EX_NEEDS_INPUT

        if row["role"] == args.role:
            print(f"  {args.username!r} is already {args.role!r}; nothing to do")
            return EX_OK

        con.execute("UPDATE users SET role=? WHERE username=?", (args.role, args.username))
        con.commit()
        admins = con.execute("SELECT COUNT(*) AS n FROM users WHERE role='admin'").fetchone()["n"]
    finally:
        con.close()

    print(f"  {args.username!r}: {row['role'] or 'user'!r} -> {args.role!r}")
    print(f"  {admins} admin(s) in {path}")
    return EX_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
