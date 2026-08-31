"""What happened, who did it, which credential shape they used, and how it ended.

The log stream ([`logging_setup`](logging_setup.py)) says what the process was doing. This says
what was *done to the accounts and the data*, in rows that outlive a log rotation and can be
queried with `sqlite3` instead of grepped. The two are joined by `request_id`: an audit row and
the log lines around it carry the same correlation id, minted once per request in
`app.middleware`.

**Its first job is not history, it is a decision.** `SHIM-SEC-006` accepts an API key presented
as `Authorization: Bearer <key>`, and removing it has been blocked since Step 13 on a question
nothing here could answer: *is anyone still sending that shape?* Every authenticated request
now records which of the three shapes let it in, and on which route, so the removal becomes an
evidenced decision rather than a guess. The shim is not removed here and its expiry has not
moved — the instrument is local, and the evidence is only produced by a deployment that runs.

**A write can never break a request.** Every entry point swallows its own failure and logs it.
An audit row is evidence about a request; it is not part of serving one, and a service that
returns 500 because it could not write its own audit trail has turned an observability feature
into an outage.

**No credential is ever a field here, and that is enforced twice.** No call site passes one —
this module records *which shape* authenticated, never the value — and on top of that every
string written passes through `logging_setup.redact_text`, the same value-shape redaction the
log stream uses. So a JWT, a bcrypt hash, an API key or the resolved signing key cannot be
persisted even by a future call site that gets it wrong. What that does not cover is a plain
password, which has no recognisable shape; that limit is the audit-side face of `RISK-OPS-005`.

**No caller fingerprint.** There is no IP address and no user-agent column, deliberately: that
is a PII and retention question that has not been decided, and collecting it "just in case" is
how a retention question gets answered by accident. The schema is a flat table of nullable
columns so adding one later is one `ALTER TABLE`.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import UTC, datetime
from typing import Any

from fastapi import Request

from app import database
from app.logging_setup import current_request_id, redact_text

logger = logging.getLogger(__name__)


# --- the event vocabulary ------------------------------------------------------------------
#
# Dotted and hierarchical so an operator can filter a family with `LIKE 'auth.login.%'`. The
# names are constants rather than string literals at the call sites because a typo in a call
# site is a row that silently never matches a query.

AUTHENTICATED = "auth.authenticated"
LOGIN_SUCCEEDED = "auth.login.succeeded"
LOGIN_FAILED = "auth.login.failed"
LOGIN_THROTTLED = "auth.login.throttled"
REGISTERED = "auth.registered"
# noqa justification: an event name, not a credential. Renaming it to satisfy the linter
# would make the audit vocabulary lie about what the event is. See rules/waivers.yaml,
# justified_suppressions.
PASSWORD_CHANGED = "auth.password.changed"  # noqa: S105
APIKEY_DISCLOSED = "auth.apikey.disclosed"
APIKEY_REGENERATED = "auth.apikey.regenerated"
ROLE_CHANGED = "admin.role.changed"
REGISTRATION_TOGGLED = "admin.registration.toggled"
ADMIN_BOOTSTRAP = "admin.bootstrap"
TASK_DELETED = "task.deleted"

EVENTS = frozenset(
    {
        AUTHENTICATED,
        LOGIN_SUCCEEDED,
        LOGIN_FAILED,
        LOGIN_THROTTLED,
        REGISTERED,
        PASSWORD_CHANGED,
        APIKEY_DISCLOSED,
        APIKEY_REGENERATED,
        ROLE_CHANGED,
        REGISTRATION_TOGGLED,
        ADMIN_BOOTSTRAP,
        TASK_DELETED,
    }
)


# --- the credential-shape discriminator ----------------------------------------------------
#
# The load-bearing part of this module. `get_current_user` accepts three shapes and, until
# now, treated the result of all three identically — which is why nobody could say whether the
# shim was still in use. These three values are what makes them distinguishable in the record.
#
# Hyphenated values, not identifiers: they are data an operator reads out of a query, and they
# must never be mistaken for a Python name.

SHAPE_API_KEY_HEADER = "api-key-header"  # X-Api-Key: <key>          — the clean API-key path
SHAPE_BEARER_JWT = "bearer-jwt"  # Authorization: Bearer <jwt>       — the clean JWT path
SHAPE_BEARER_API_KEY = "bearer-api-key"  # Authorization: Bearer <key> — SHIM-SEC-006

SHAPES = frozenset({SHAPE_API_KEY_HEADER, SHAPE_BEARER_JWT, SHAPE_BEARER_API_KEY})


# --- outcomes --------------------------------------------------------------------------------

SUCCESS = "success"
FAILURE = "failure"  # the actor asked for something and the request was wrong
REFUSED = "refused"  # the request was well formed and a control said no
NOOP = "noop"  # nothing happened, and that is the fact worth recording

OUTCOMES = frozenset({SUCCESS, FAILURE, REFUSED, NOOP})


# --- the schema ------------------------------------------------------------------------------
#
# One table. Everything except the identity, the timestamp, the event and the outcome is
# NULLable, because most events genuinely have no value for most of the rest: a login failure
# has no authenticated principal, a boot-time promotion has no request id, and a password
# change has no subject distinct from its actor. A column that has to be filled with a
# placeholder stops being readable.
#
# There is exactly ONE version of this schema and it is created fresh everywhere, so the
# fresh-versus-migrated divergence recorded as RISK-SURF-001 for users.db does not exist here.
# Keeping it that way is a rule for the next person: when a column is added, the CREATE below
# and an additive ALTER TABLE have to land in the same change, or the two paths part company
# exactly the way they did for users.api_key. `test_audit.py` pins this column list.

AUDIT_COLUMNS = (
    "id",
    "recorded_at",
    "event",
    "actor",
    "subject",
    "outcome",
    "auth_shape",
    "route",
    "request_id",
    "detail",
)

CREATE_AUDIT_EVENTS = """
CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    event TEXT NOT NULL,
    actor TEXT,
    subject TEXT,
    outcome TEXT NOT NULL,
    auth_shape TEXT,
    route TEXT,
    request_id TEXT,
    detail TEXT
)
"""

# The shim query is the reason this table exists, so the index it needs is declared with it
# rather than discovered when the table is large enough to be slow.
CREATE_SHAPE_INDEX = """
CREATE INDEX IF NOT EXISTS audit_events_shape
ON audit_events (auth_shape, route)
"""

CREATE_EVENT_INDEX = """
CREATE INDEX IF NOT EXISTS audit_events_event_time
ON audit_events (event, recorded_at)
"""

INSERT_EVENT = """
INSERT INTO audit_events
    (recorded_at, event, actor, subject, outcome, auth_shape, route, request_id, detail)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


def init_store() -> None:
    """Create the table and its indexes. Called once from the lifespan; idempotent.

    A failure here is logged and the boot continues, the same judgement `init_db` makes about
    a migration failure (ADR 0025): the audit log is evidence about the service, and losing
    the evidence must not also lose the service. The consequence is stated rather than hidden
    — every subsequent write will fail and log, one line per event, which is loud.
    """
    try:
        with database.audit_connection() as connection:
            connection.execute(CREATE_AUDIT_EVENTS)
            connection.execute(CREATE_SHAPE_INDEX)
            connection.execute(CREATE_EVENT_INDEX)
            connection.commit()
    except (sqlite3.Error, OSError) as failure:
        logger.error(
            "the audit store could not be initialised",
            extra={"audit_db": str(database.audit_db_path()), "audit_error": str(failure)},
        )


def _clean(value: Any) -> str | None:
    """One column value: a string with every recognisable credential removed, or NULL.

    The redaction pass is defence in depth and is expected to be a no-op on every call site in
    this repository. It exists because the cost of it being needed once is a credential in a
    file nothing rotates.
    """
    if value is None:
        return None
    return redact_text(str(value))


def now() -> str:
    """UTC to the millisecond, in the same shape the JSON log stream stamps its lines with."""
    return datetime.now(tz=UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def record(
    event: str,
    *,
    outcome: str,
    actor: str | None = None,
    subject: str | None = None,
    auth_shape: str | None = None,
    route: str | None = None,
    detail: str | None = None,
) -> None:
    """Write one audit row. Never raises.

    `actor` is the acting principal, `subject` the thing acted upon where the two differ — for
    a role change they are the administrator and the target account. `request_id` is not a
    parameter: it is read from the same `ContextVar` the log formatter reads, so an audit row
    and the lines around it cannot disagree about which request they belong to.
    """
    try:
        with database.audit_connection() as connection:
            connection.execute(
                INSERT_EVENT,
                (
                    now(),
                    event,
                    _clean(actor),
                    _clean(subject),
                    outcome,
                    auth_shape,
                    _clean(route),
                    current_request_id.get() or None,
                    _clean(detail),
                ),
            )
            connection.commit()
    except (sqlite3.Error, OSError) as failure:
        # Deliberately broad in what it tolerates and narrow in what it reports: the event
        # name and the outcome are recorded here so the line is still usable evidence that
        # something happened, even though the durable row is lost.
        logger.error(
            "the audit event could not be written",
            extra={"audit_event": event, "outcome": outcome, "audit_error": str(failure)},
        )


def route_of(request: Request | None) -> str | None:
    """`"GET /tasks/{uuid}"` — the route TEMPLATE, never the requested path.

    The template and not the path, for two reasons. It groups: "who still uses the shim, on
    what" is a question about endpoints, and a thousand rows keyed by task uuid answer it
    worse than one. And it is safe: a path is caller-controlled text that really does arrive
    with a credential in it — `docs/operations.md` quotes two access-log lines where exactly
    that happened — and a template is a string this repository wrote.
    """
    route = request.scope.get("route") if request is not None else None
    template = getattr(route, "path_format", None)
    if not template:
        return None
    methods = sorted(getattr(route, "methods", None) or [])
    method = next((m for m in methods if m not in {"HEAD", "OPTIONS"}), None)
    return f"{method} {template}" if method else str(template)
