"""One JSON object per line, on one stream, with every credential removed on the way out.

Before this module the serving application emitted nothing of its own: what production wrote
was uvicorn's plain-text default, and there was no way to answer "what happened during that
request" beyond a status code and a path. This is the transport `RULE-OPS-002` deliberately
left undecided (`docs/adr/0023-no-secrets-in-logs.md`).

**One stream, uvicorn included.** uvicorn's access and error loggers are re-pointed at the
same handler, the same formatter and the same redaction filter as the application's own
loggers, so an access line, an application line and a traceback are the same shape and pass
through the same control. A second stream would be a second format to parse and, worse, a
path around the filter.

**JSON is not configurable.** Only the level is (`LOG_LEVEL`). There is deliberately no
setting that turns structure or redaction off, because the configuration that disables a
control is the configuration that will be set on the day someone is debugging.

**Redaction is the runtime half of a two-part control, and neither half is sufficient.**
`RULE-OPS-002` reads source and refuses a credential-bearing *name* at the call site; it
cannot see `logger.info("rejected %s", row)` where `row` happens to hold a password hash, and
it does not read uvicorn, a library, or a traceback. This filter reads *values* and does not
care what they are called; it cannot see a credential that matches no shape it knows. The
static rule catches what has a name, the filter catches what has a shape, and what has
neither is `RISK-OPS-005`.

Redaction replaces with a marker rather than deleting: a line that says a token was there and
has been removed is still evidence; a line with a hole in it is a puzzle.
"""

from __future__ import annotations

import json
import logging
import logging.config
import re
import traceback
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from app.config import settings

# The response header the correlation id is echoed on, and the request-scoped slot the
# formatter reads it from. A ContextVar rather than a module global: FastAPI serves requests
# concurrently in one process, so a global would be read by whichever request happened to be
# formatting a line — a correlation id that correlates the wrong things is worse than none.
REQUEST_ID_HEADER = "X-Request-Id"
current_request_id: ContextVar[str] = ContextVar("runway_request_id", default="")

REDACTION_MARKER = "[redacted]"

DEFAULT_LEVEL = "INFO"
LEVEL_NAMES = frozenset({"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"})


# --- what counts as a credential --------------------------------------------------------
#
# By name, this is deliberately the same vocabulary tools/checks/log_secrets.py enforces
# statically, so a field the gate would refuse at the call site is also removed at runtime if
# it arrives some other way — through uvicorn, through a library, or under a `**` expansion.

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

# Two-segment names where neither segment alone is specific enough. `key` on its own is a
# column in site_settings and a dict key everywhere; `api_key` is a credential.
CREDENTIAL_PAIRS = frozenset(
    {"api_key", "api_keys", "new_key", "raw_key", "access_key", "private_key", "signing_key"}
)

_SEGMENT_SPLIT = re.compile(r"[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])")

# By value shape. This is the half the static rule cannot do: it catches a credential that
# arrives under an innocent name, which is exactly the gap RISK-OPS-004 records.
#
#   JWT      three base64url segments; every token this app mints starts `eyJ` because that
#            is `{"` base64url-encoded, and the header always begins that way
#   bcrypt   passlib's modular-crypt output — `$2b$<cost>$` plus 53 characters. A hash is a
#            credential-equivalent here: it is offline-attackable, which is the whole
#            argument in RISK-DEP-003 for keeping bcrypt's cost where it is
#   api key  database.generate_api_key is secrets.token_urlsafe(32), which is exactly 43
#            characters of the URL-safe base64 alphabet, bounded so a longer run is not a
#            partial match
_VALUE_SHAPES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("jwt", re.compile(r"eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}")),
    ("bcrypt", re.compile(r"\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}")),
    ("api-key", re.compile(r"(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])")),
)

# Below this length a "secret" is not distinctive enough to search for without redacting
# unrelated text, and an empty one would make str.replace rewrite every character boundary.
MINIMUM_LITERAL_LENGTH = 8


def segments(name: str) -> list[str]:
    return [part.lower() for part in _SEGMENT_SPLIT.split(name) if part]


def names_a_credential(name: str) -> bool:
    """True when a field name says the value is a credential, by this repository's vocabulary."""
    parts = segments(name)
    if any(part in CREDENTIAL_WORDS for part in parts):
        return True
    return any(f"{a}_{b}" in CREDENTIAL_PAIRS for a, b in zip(parts, parts[1:], strict=False))


def configured_literals() -> tuple[str, ...]:
    """Secret values this process holds, to be removed wherever they appear.

    The resolved signing key is the one credential this application knows the exact value of,
    so it can be matched literally instead of by shape — which matters, because a good
    `JWT_SECRET` is 48 random bytes with no shape at all. Read on each call rather than
    captured at import, so a value replaced at runtime is still covered.
    """
    value = (settings.jwt_secret or "").strip()
    return (value,) if len(value) >= MINIMUM_LITERAL_LENGTH else ()


def redact_text(text: str) -> str:
    """Remove every credential this module can recognise from a rendered string."""
    for literal in configured_literals():
        if literal in text:
            text = text.replace(literal, REDACTION_MARKER)
    for _, pattern in _VALUE_SHAPES:
        text = pattern.sub(REDACTION_MARKER, text)
    return text


def redact(value: Any, field: str | None = None) -> Any:
    """Redact one logged value, by the name it arrives under and by the shape it has.

    Recurses into containers, because a structured field is routinely a dict — and a
    credential one level down is disclosed exactly as completely as one at the top.
    """
    if field is not None and names_a_credential(field):
        return REDACTION_MARKER
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, bytes | bytearray):
        return redact_text(bytes(value).decode("utf-8", errors="replace"))
    if isinstance(value, dict):
        return {key: redact(item, field=str(key)) for key, item in value.items()}
    if isinstance(value, list | tuple | set):
        return [redact(item) for item in value]
    return value


# --- the formatter and the filter --------------------------------------------------------

# Everything logging itself puts on a record. What is left over is what the caller passed as
# `extra=`, which is where structured fields go.
_RESERVED = frozenset(
    {
        "args",
        "asctime",
        # uvicorn attaches an ANSI-coloured duplicate of its own message to every record it
        # emits. It is not a caller's structured field, and carrying it would put escape
        # codes and a second copy of the message on every access line.
        "color_message",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "message",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "taskName",
        "thread",
        "threadName",
    }
)


class JsonFormatter(logging.Formatter):
    """One JSON object per line: when, how bad, who said it, what happened, which request."""

    def format(self, record: logging.LogRecord) -> str:
        moment = datetime.fromtimestamp(record.created, tz=UTC)
        payload: dict[str, Any] = {
            "timestamp": moment.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = current_request_id.get()
        if request_id:
            payload["request_id"] = request_id

        for key, value in record.__dict__.items():
            if key in _RESERVED or key.startswith("_") or key in payload:
                continue
            payload[key] = value

        if record.exc_info:
            payload["exception"] = "".join(traceback.format_exception(*record.exc_info)).rstrip()
        elif record.exc_text:
            payload["exception"] = record.exc_text
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)

        # Redaction is the last thing that happens before serialisation, so it also covers
        # the rendered message — a `%`-interpolated argument and a traceback's local values
        # only become text here.
        return json.dumps(redact(payload), default=str, ensure_ascii=False)


class RedactionFilter(logging.Filter):
    """Neutralise the record itself, before any formatter is asked to render it.

    Attached to the handler rather than to a logger: a handler filter sees every record that
    reaches the handler whatever logger produced it, whereas a logger filter sees only that
    logger's own records. With one handler and everything propagating to the root, that makes
    this the single point every emitted line passes through.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_text(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {key: redact(v, field=str(key)) for key, v in record.args.items()}
            else:
                record.args = tuple(redact(value) for value in record.args)
        for key, value in list(record.__dict__.items()):
            if key in _RESERVED or key.startswith("_"):
                continue
            record.__dict__[key] = redact(value, field=key)
        return True


# --- configuration ------------------------------------------------------------------------


def resolve_level(level: str | None = None) -> str:
    """The effective level name. An unrecognised LOG_LEVEL falls back rather than refusing.

    Refusing to boot is the right answer for a `JWT_SECRET` that would forge tokens
    (`startup_checks`); it is the wrong answer for a typo in a verbosity knob, where the cost
    of the mistake is some missing DEBUG lines and the cost of the refusal is an outage.
    """
    candidate = (level if level is not None else settings.log_level or "").strip().upper()
    return candidate if candidate in LEVEL_NAMES else DEFAULT_LEVEL


def dict_config(level: str | None = None) -> dict[str, Any]:
    """The complete logging configuration, for `dictConfig` and for uvicorn's `--log-config`.

    One definition, two consumers: `configure_logging` applies it in-process, and
    `backend/log_config.json` is this same dictionary serialised at the default level so
    uvicorn's own loggers are replaced from its very first line rather than from the moment
    the application happens to import. A unit test holds the file to this function.
    """
    resolved = resolve_level(level)
    return {
        "version": 1,
        # The application's own module loggers already exist by the time this runs; disabling
        # them would silence exactly the code this exists to make observable.
        "disable_existing_loggers": False,
        "formatters": {"runway-json": {"()": "app.logging_setup.JsonFormatter"}},
        "filters": {"runway-redaction": {"()": "app.logging_setup.RedactionFilter"}},
        "handlers": {
            "stdout": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "runway-json",
                "filters": ["runway-redaction"],
            }
        },
        "root": {"handlers": ["stdout"], "level": resolved},
        # No handlers of their own and propagate: True — uvicorn's default configuration gives
        # each of these its own plain-text handler, and leaving even one in place would put an
        # unredacted line on stdout beside the JSON ones.
        "loggers": {
            "uvicorn": {"handlers": [], "level": resolved, "propagate": True},
            "uvicorn.error": {"handlers": [], "level": resolved, "propagate": True},
            "uvicorn.access": {"handlers": [], "level": resolved, "propagate": True},
        },
    }


def configure_logging(level: str | None = None) -> None:
    """Install the JSON stream. Idempotent — dictConfig replaces, it does not accumulate."""
    logging.config.dictConfig(dict_config(level))
