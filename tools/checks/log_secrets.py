"""Keep credentials out of the log stream, by refusing them at the call site.

Emits `RULE-ID|message` lines; `tools/checks/log-secrets.sh` turns them into gate failures.

A log line is the one place a credential is copied deliberately, written to disk, shipped to
whatever aggregates the output, and kept for as long as the retention policy says — usually
longer than anyone remembers. A password in a database is a credential under a control; the
same password in a log line is a credential in a filesystem, a backup, and a terminal
scrollback. Nothing raises, nothing errors, and the disclosure is invisible until someone
reads the file.

**The property this holds is currently true.** The serving application has no logging at all
today — no `import logging`, no `getLogger`, no `print()` anywhere under `backend/app/` — so
what production emits is uvicorn's own output and nothing this repository wrote. That is
precisely why the rule lands now: the property is free to hold while there is nothing to
break, and it becomes losable in the first commit that adds a logger. The reviewer who would
have caught `logger.info(f"login for {username} with {body.password}")` is the same reviewer
who is reading a hundred other lines of a new logging module.

**Scoped to `backend/app/`** — the serving application, the only code whose output reaches a
production log. Repository tooling under `tools/` prints to a developer's terminal inside the
gate and never sees a user credential.

**Transport-independent.** This reads source, not output, so it holds whichever way structured
logging is eventually wired up: a replaced uvicorn access logger, a JSON application logger
alongside it, or both. A rule that inspected emitted lines would have to be rewritten the day
the transport changed, and a rule that gets rewritten under pressure is a rule that gets
relaxed.

**A name-based scan, and it knows it.** It matches credential-bearing *names* — the ones this
codebase actually uses — wherever they appear inside a logging call's arguments: directly, in
an f-string, through `%` or `.format()`, and in the `extra={...}` dict where structured fields
will go. It cannot see a credential that arrives under a neutral name (`body`, `value`, `row`),
one assembled at runtime, or one that a called function returns without saying so in its name.
That limit is recorded as `RISK-OPS-004` rather than implied.

**Escape hatch:** `# log-secrets: allow` anywhere in the logging statement, with a reason. It
is a single greppable string, so the standing exemptions are one `grep` away from review.
"""

from __future__ import annotations

import ast
import re
import subprocess  # noqa: S404  # tooling: reads the tracked-file list
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCOPE = "backend/app/"

ALLOW_MARKER = "log-secrets: allow"

# The methods that put a message into the stream. `log` is the level-as-argument form.
LOG_METHODS = frozenset(
    {"debug", "info", "warning", "warn", "error", "exception", "critical", "fatal", "log"}
)

# Calls that hand back a logger. Canonical dotted names; local aliases and `from x import y`
# bindings are resolved to these first, so `from logging import getLogger as gl` is not a hole.
LOGGER_FACTORIES = frozenset(
    {"logging.getLogger", "logging.Logger", "logging.LoggerAdapter", "logging.getLoggerClass"}
)

# A receiver that is named like a logger is treated as one. Loggers arrive from places this
# scan cannot follow — a dependency, an attribute set in __init__, a module that re-exports
# one — and the convention in every Python codebase is to call the thing `logger` or `log`.
LOGGER_NAME_HINTS = frozenset({"log", "logs", "logger", "logging"})

# Whole-argument dumps. `extra=locals()` is the structured-logging equivalent of passing
# **kwargs: the payload cannot be read at the call site, so it cannot be reviewed there, and
# in a request handler the locals are exactly where the password is.
WHOLESALE_DUMPS = frozenset({"locals", "vars", "globals", "dir"})

# Credential-bearing name segments. Every one of these is a name this repository actually
# uses; none of them is speculative:
#
#   password / passwd / pwd  UserCreate.password, UserLogin.password, PasswordChange
#                            .current_password/.new_password, hash_password, verify_password,
#                            the hashed_password column
#   hashed                   verify_password(plain, hashed) — a bcrypt hash is still a
#                            credential-equivalent: it is offline-attackable
#   secret                   Settings.jwt_secret, and startup_checks' resolved secret
#   token / jwt              create_access_token, decode_token, Token.access_token, and the
#                            bearer token in the Authorization header
#   credential(s)            HTTPAuthorizationCredentials, and credentials.credentials — the
#                            raw bearer string, which SHIM-SEC-006 also accepts as an API key
#   apikey / bearer /        the X-Api-Key header, `x_api_key`, and the shim's own vocabulary
#   authorization
CREDENTIAL_WORDS = frozenset(
    {
        "password",
        "passwords",
        "passwd",
        "pwd",
        "hashed",
        "secret",
        "secrets",
        "token",
        "tokens",
        "jwt",
        "credential",
        "credentials",
        "apikey",
        "apikeys",
        "bearer",
        "authorization",
    }
)

# Two-segment names, where neither segment alone is specific enough to match on. `key` on its
# own is a column name in site_settings and a dict key everywhere; `api_key` is a credential.
CREDENTIAL_PAIRS = frozenset(
    {
        "api_key",  # the users.api_key column, the X-Api-Key header, ApiKeyInfo.api_key
        "api_keys",
        "new_key",  # routers/auth.py regenerate_apikey — a freshly minted key, in the clear
        "raw_key",
        "access_key",
        "private_key",
        "signing_key",
    }
)

_SEGMENT_SPLIT = re.compile(r"[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])")

problems: list[str] = []


def tracked_python_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", SCOPE], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    return [rel for rel in out if rel.endswith(".py")]


def segments(name: str) -> list[str]:
    return [part.lower() for part in _SEGMENT_SPLIT.split(name) if part]


def is_credential_name(name: str) -> bool:
    """True when an identifier names a credential, by this repository's own vocabulary."""
    parts = segments(name)
    if any(part in CREDENTIAL_WORDS for part in parts):
        return True
    return any(f"{a}_{b}" in CREDENTIAL_PAIRS for a, b in zip(parts, parts[1:], strict=False))


def import_bindings(tree: ast.Module) -> dict[str, str]:
    """Map every locally bound name back to its canonical dotted name.

    `import logging as lg` binds `lg` -> `logging`; `from logging import getLogger as gl`
    binds `gl` -> `logging.getLogger`. Without this the check would be defeated by a rename,
    which is the kind of hole that makes a rule advisory.
    """
    bindings: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                bindings[alias.asname or alias.name.split(".")[0]] = (
                    alias.name if alias.asname else alias.name.split(".")[0]
                )
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            for alias in node.names:
                bindings[alias.asname or alias.name] = f"{node.module}.{alias.name}"
    return bindings


def dotted_name(node: ast.expr) -> str | None:
    """Render `a.b.c` from an attribute/name chain; None for anything else."""
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if not isinstance(node, ast.Name):
        return None
    parts.append(node.id)
    return ".".join(reversed(parts))


def canonical(name: str, bindings: dict[str, str]) -> str:
    head, _, rest = name.partition(".")
    if head not in bindings:
        return name
    return f"{bindings[head]}.{rest}" if rest else bindings[head]


def logger_bindings(tree: ast.Module, bindings: dict[str, str]) -> set[str]:
    """Names assigned a logger: `logger = logging.getLogger(__name__)` and `.getChild(...)`."""
    found: set[str] = set()
    for node in ast.walk(tree):
        targets: list[ast.expr] = []
        if isinstance(node, ast.Assign):
            targets = list(node.targets)
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets = [node.target]
        else:
            continue
        value = node.value
        if not isinstance(value, ast.Call):
            continue
        raw = dotted_name(value.func)
        if raw is None:
            continue
        name = canonical(raw, bindings)
        if name not in LOGGER_FACTORIES and not name.endswith(".getChild"):
            continue
        for target in targets:
            rendered = dotted_name(target)
            if rendered:
                found.add(rendered)
    return found


def is_logger_factory(call: ast.Call, bindings: dict[str, str]) -> bool:
    raw = dotted_name(call.func)
    if raw is None:
        return False
    name = canonical(raw, bindings)
    return name in LOGGER_FACTORIES or name.endswith(".getChild")


def logging_call(call: ast.Call, bindings: dict[str, str], loggers: set[str]) -> str | None:
    """The name of the logging call this node makes, or None if it is not one."""
    # print() is the log transport of a containerised process whether anyone calls it that
    # or not: stdout is what the collector reads.
    if isinstance(call.func, ast.Name) and call.func.id == "print" and "print" not in bindings:
        return "print()"

    # `logging.getLogger(__name__).info(...)` — the logger is never bound to a name at all,
    # so there is no dotted chain to render. It is the shape a first logging line most often
    # takes, and reading it as "not a logging call" would be the largest hole in this scan.
    if (
        isinstance(call.func, ast.Attribute)
        and call.func.attr in LOG_METHODS
        and isinstance(call.func.value, ast.Call)
        and is_logger_factory(call.func.value, bindings)
    ):
        return f"{render(call.func.value)}.{call.func.attr}()"

    raw = dotted_name(call.func)
    if raw is None:
        return None
    name = canonical(raw, bindings)
    head, _, method = name.rpartition(".")
    if not head or method not in LOG_METHODS:
        return None

    # logging.info(...) and friends — the module-level convenience functions.
    if head == "logging":
        return name
    if head in loggers or canonical(head, bindings) in loggers:
        return f"{head}.{method}()"
    if segments(head)[-1] in LOGGER_NAME_HINTS or head.endswith(("_log", "_logger")):
        return f"{head}.{method}()"
    return None


def render(node: ast.AST) -> str:
    try:
        text = ast.unparse(node)
    except Exception:  # pragma: no cover — unparse handles every expression we reach
        return "<expression>"
    return text if len(text) <= 60 else text[:57] + "..."


def credential_findings(call: ast.Call) -> list[tuple[str, str]]:
    """(kind, rendered) for every credential-bearing thing in this call's arguments.

    The whole argument subtree is walked, so an f-string, a `%` interpolation, a `.format()`
    call and an `extra={...}` dict are all covered by the same pass — the credential is a
    `Name`, an `Attribute`, a string dict key or a keyword either way.
    """
    found: list[tuple[str, str]] = []
    seen: set[str] = set()

    def note(kind: str, text: str) -> None:
        if text not in seen:
            seen.add(text)
            found.append((kind, text))

    subtrees: list[ast.AST] = list(call.args)
    for keyword in call.keywords:
        if keyword.arg and is_credential_name(keyword.arg):
            note("credential", f"{keyword.arg}=")
        subtrees.append(keyword.value)

    for subtree in subtrees:
        for node in ast.walk(subtree):
            if isinstance(node, ast.Name) and is_credential_name(node.id):
                note("credential", node.id)
            elif isinstance(node, ast.Attribute) and is_credential_name(node.attr):
                note("credential", render(node))
            elif isinstance(node, ast.keyword) and node.arg and is_credential_name(node.arg):
                note("credential", f"{node.arg}=")
            elif isinstance(node, ast.Dict):
                for key in node.keys:
                    if (
                        isinstance(key, ast.Constant)
                        and isinstance(key.value, str)
                        and is_credential_name(key.value)
                    ):
                        note("credential", f"{key.value!r}:")
            elif isinstance(node, ast.Subscript):
                index = node.slice
                if (
                    isinstance(index, ast.Constant)
                    and isinstance(index.value, str)
                    and is_credential_name(index.value)
                ):
                    note("credential", render(node))
            elif isinstance(node, ast.Call):
                name = dotted_name(node.func)
                if name and name.rpartition(".")[2] in WHOLESALE_DUMPS:
                    note("dump", render(node))

    return found


def scan(rel: str) -> None:
    path = ROOT / rel
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return

    try:
        tree = ast.parse(source, filename=rel)
    except SyntaxError:
        return  # ruff and mypy own syntax; this rule has nothing to say about it

    lines = source.splitlines()
    bindings = import_bindings(tree)
    loggers = logger_bindings(tree, bindings)

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        called = logging_call(node, bindings, loggers)
        if called is None:
            continue

        # The exemption applies to the whole statement, because that is the unit a reviewer
        # reads — a marker on line one of a five-line call means the same thing as one on
        # line five, and requiring a particular line would only teach people to guess.
        span = lines[node.lineno - 1 : (node.end_lineno or node.lineno)]
        if any(ALLOW_MARKER in line for line in span):
            continue

        where = f"{rel}:{node.lineno}"
        for kind, text in credential_findings(node):
            if kind == "dump":
                problems.append(
                    f"RULE-OPS-002|{where} passes {text} to {called}, which logs whatever "
                    "happens to be in scope. In a request handler that includes the password "
                    "— name the fields you mean, one at a time"
                )
            else:
                problems.append(
                    f"RULE-OPS-002|{where} puts {text} into {called}. A credential in a log "
                    "line is a credential in a file, a backup and someone's scrollback — log "
                    "the username or a key id instead, or append "
                    f"`{ALLOW_MARKER}` with a reason if it truly is not one"
                )


def main() -> int:
    for rel in tracked_python_files():
        scan(rel)
    for problem in problems:
        print(problem)
    return 0


if __name__ == "__main__":
    sys.exit(main())
