"""The log stream: its shape, its correlation id, and what it refuses to carry.

The last test in this file is the one that matters. Everything above it checks a mechanism in
isolation; `test_no_credential_reaches_the_log_stream` drives the real endpoints through the
real application with the real logging configuration installed and asserts that the token,
the API key and the password the fixture just created appear nowhere in what was written.
That is the adversarial proof the Security-or-Operability pattern requires, and it is the one
that would notice a leak arriving through a path nobody thought to unit-test.
"""

from __future__ import annotations

import contextlib
import io
import json
import logging
import re
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.config import settings
from app.database import generate_api_key
from app.logging_setup import (
    REDACTION_MARKER,
    REQUEST_ID_HEADER,
    JsonFormatter,
    RedactionFilter,
    configure_logging,
    dict_config,
    resolve_level,
)
from app.middleware import REQUEST_ID_LENGTH

BACKEND = Path(__file__).resolve().parents[2]


@contextlib.contextmanager
def isolated_logger() -> Iterator[tuple[logging.Logger, io.StringIO]]:
    """A logger wired exactly as `configure_logging` wires the root one, writing to memory."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactionFilter())
    logger = logging.getLogger(f"runway.test.{uuid.uuid4().hex}")
    logger.handlers = [handler]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    try:
        yield logger, stream
    finally:
        logger.handlers = []


def emitted(stream: io.StringIO) -> list[dict]:
    """Every line written, parsed. Fails loudly if a line is not one JSON object."""
    lines = stream.getvalue().splitlines()
    assert lines, "nothing was logged"
    return [json.loads(line) for line in lines]


# --- the shape of a line -------------------------------------------------------------------


def test_every_line_is_one_json_object():
    with isolated_logger() as (logger, stream):
        logger.info("first")
        logger.warning("second")

    raw = stream.getvalue().splitlines()
    assert len(raw) == 2
    for line in raw:
        parsed = json.loads(line)
        assert isinstance(parsed, dict)
        assert set(parsed) >= {"timestamp", "level", "logger", "message"}


def test_a_line_carries_when_how_bad_who_and_what():
    with isolated_logger() as (logger, stream):
        logger.warning("login throttled", extra={"username": "alice", "retry_after": 42})

    (line,) = emitted(stream)
    assert line["level"] == "WARNING"
    assert line["message"] == "login throttled"
    assert line["logger"].startswith("runway.test.")
    assert line["username"] == "alice"
    assert line["retry_after"] == 42
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", line["timestamp"])


def test_percent_interpolation_is_rendered_into_the_message():
    with isolated_logger() as (logger, stream):
        logger.info("login throttled for %s", "alice")

    (line,) = emitted(stream)
    assert line["message"] == "login throttled for alice"


def test_a_traceback_becomes_a_field_not_a_second_line():
    with isolated_logger() as (logger, stream):
        try:
            raise RuntimeError("boom")
        except RuntimeError:
            logger.exception("handler failed")

    (line,) = emitted(stream)
    assert line["message"] == "handler failed"
    assert "RuntimeError: boom" in line["exception"]


def test_an_unserialisable_value_does_not_lose_the_line():
    """A log call is not a place to raise. `default=str` keeps the line rather than the type."""

    class Opaque:
        def __str__(self) -> str:
            return "opaque"

    with isolated_logger() as (logger, stream):
        logger.info("carrying an object", extra={"thing": Opaque()})

    (line,) = emitted(stream)
    assert line["thing"] == "opaque"


# --- redaction by field name ----------------------------------------------------------------


@pytest.mark.parametrize(
    "field",
    [
        "password",
        "current_password",
        "new_password",
        "hashed_password",
        "api_key",
        "new_key",
        "token",
        "access_token",
        "jwt_secret",
        "credentials",
        "authorization",
        "x_api_key",
    ],
)
def test_a_credential_named_field_is_redacted(field: str):
    with isolated_logger() as (logger, stream):
        logger.info("structured field", extra={field: "hunter2"})

    (line,) = emitted(stream)
    assert line[field] == REDACTION_MARKER
    assert "hunter2" not in stream.getvalue()


def test_a_credential_nested_one_level_down_is_redacted():
    with isolated_logger() as (logger, stream):
        logger.info("nested", extra={"body": {"username": "alice", "password": "hunter2"}})

    (line,) = emitted(stream)
    assert line["body"] == {"username": "alice", "password": REDACTION_MARKER}


def test_a_credential_inside_a_list_or_a_bytestring_is_redacted():
    """Containers and bytes are the two shapes that would otherwise walk straight past."""
    key = generate_api_key()

    with isolated_logger() as (logger, stream):
        logger.info("carried", extra={"seen": [key], "raw": f"key={key}".encode()})

    (line,) = emitted(stream)
    assert line["seen"] == [REDACTION_MARKER]
    assert line["raw"] == f"key={REDACTION_MARKER}"


def test_mapping_style_interpolation_is_redacted_before_it_is_rendered():
    """`logger.info(fmt, {...})` is the one call shape where the arguments are a dict."""
    with isolated_logger() as (logger, stream):
        logger.info("%(username)s signed in", {"username": "alice", "password": "hunter2"})

    (line,) = emitted(stream)
    assert line["message"] == "alice signed in"
    assert "hunter2" not in stream.getvalue()


def test_a_cached_exception_text_and_a_stack_trace_are_both_redacted():
    key = generate_api_key()
    record = logging.LogRecord(
        name="runway.test",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg="handler failed",
        args=(),
        exc_info=None,
    )
    record.exc_text = f"RuntimeError: rejected {key}"
    record.stack_info = f'  File "auth.py", line 1\n    key = "{key}"'

    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactionFilter())
    handler.handle(record)

    (line,) = emitted(stream)
    assert key not in stream.getvalue()
    assert REDACTION_MARKER in line["exception"]
    assert REDACTION_MARKER in line["stack"]


def test_an_innocent_field_survives():
    """Redaction that eats the useful half of the line gets switched off, so it must not."""
    with isolated_logger() as (logger, stream):
        logger.info("login succeeded", extra={"username": "alice", "key": "allow_registration"})

    (line,) = emitted(stream)
    assert line["username"] == "alice"
    assert line["key"] == "allow_registration"


# --- redaction by value shape, under a neutral name -------------------------------------------
#
# This is the half RULE-OPS-002 cannot do. Every credential below arrives under the field name
# `detail`, which says nothing, and in the message text, which says less.


def test_a_real_jwt_is_redacted_under_a_neutral_name():
    token = create_access_token("alice")
    assert token.startswith("eyJ")

    with isolated_logger() as (logger, stream):
        logger.info("rejected %s", token, extra={"detail": token})

    (line,) = emitted(stream)
    assert line["detail"] == REDACTION_MARKER
    assert line["message"] == f"rejected {REDACTION_MARKER}"
    assert token not in stream.getvalue()


def test_a_real_api_key_is_redacted_under_a_neutral_name():
    key = generate_api_key()

    with isolated_logger() as (logger, stream):
        logger.info("presented %s", key, extra={"detail": key})

    (line,) = emitted(stream)
    assert line["detail"] == REDACTION_MARKER
    assert key not in stream.getvalue()


def test_a_bcrypt_hash_is_redacted_under_a_neutral_name():
    hashed = hash_password("correct horse battery staple")
    assert hashed.startswith("$2")

    with isolated_logger() as (logger, stream):
        logger.info("row was %s", hashed, extra={"detail": hashed})

    (line,) = emitted(stream)
    assert line["detail"] == REDACTION_MARKER
    assert hashed not in stream.getvalue()


def test_the_resolved_jwt_secret_is_redacted_under_a_neutral_name():
    """A good signing key is random bytes with no shape, so it is matched literally instead."""
    secret = settings.jwt_secret
    assert len(secret) >= 32

    with isolated_logger() as (logger, stream):
        logger.info("configured with %s", secret, extra={"detail": secret})

    (line,) = emitted(stream)
    assert line["detail"] == REDACTION_MARKER
    assert secret not in stream.getvalue()


def test_a_credential_in_a_traceback_is_redacted():
    """Tracebacks are outside RULE-OPS-002 entirely — nobody writes the line that emits one."""
    key = generate_api_key()

    with isolated_logger() as (logger, stream):
        try:
            raise RuntimeError(f"rejected key {key}")
        except RuntimeError:
            logger.exception("auth failed")

    (line,) = emitted(stream)
    assert key not in stream.getvalue()
    assert REDACTION_MARKER in line["exception"]


def test_a_password_under_a_neutral_name_is_the_recorded_limit():
    """A password has no shape, so nothing can match it. This pins RISK-OPS-005 rather than
    implying it: the two controls together cover names and shapes, and a plain string that is
    neither is what remains. Change this test only by making the claim less true."""
    with isolated_logger() as (logger, stream):
        logger.info("submitted", extra={"detail": "correct horse battery staple"})

    (line,) = emitted(stream)
    assert line["detail"] == "correct horse battery staple"


# --- configuration ------------------------------------------------------------------------


def test_the_level_is_the_only_thing_configuration_can_move():
    config = dict_config("DEBUG")
    assert config["root"]["level"] == "DEBUG"
    assert config["formatters"]["runway-json"]["()"] == "app.logging_setup.JsonFormatter"
    assert config["handlers"]["stdout"]["filters"] == ["runway-redaction"]


@pytest.mark.parametrize("given", ["debug", "DEBUG", " warning "])
def test_a_recognised_level_is_honoured(given: str):
    assert resolve_level(given) == given.strip().upper()


@pytest.mark.parametrize("given", ["", "verbose", "9"])
def test_an_unrecognised_level_falls_back_rather_than_refusing_to_boot(given: str):
    assert resolve_level(given) == "INFO"


def test_uvicorns_ansi_duplicate_of_the_message_is_dropped():
    """uvicorn puts `color_message` on every record it emits — the same text with escape
    codes in it. It is uvicorn's, not a caller's field, and it would double every access line."""
    with isolated_logger() as (logger, stream):
        logger.info("Started server process", extra={"color_message": "Started \x1b[36m%d\x1b[0m"})

    (line,) = emitted(stream)
    assert "color_message" not in line
    assert "\\u001b" not in stream.getvalue()


def test_uvicorns_loggers_are_re_pointed_at_the_one_stream():
    """Every uvicorn logger loses its own handler and propagates, or its lines would reach
    stdout in plain text and without passing the redaction filter."""
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        declared = dict_config()["loggers"][name]
        assert declared["handlers"] == []
        assert declared["propagate"] is True


def test_the_checked_in_uvicorn_log_config_is_the_module_it_claims_to_be():
    """`--log-config` needs a file, and a file is a copy. This is the thing that keeps the
    copy honest — edit app/logging_setup.py, regenerate, never the other way round."""
    on_disk = json.loads((BACKEND / "log_config.json").read_text(encoding="utf-8"))
    assert on_disk == dict_config("INFO")


def test_the_image_starts_uvicorn_with_that_file():
    dockerfile = (BACKEND / "Dockerfile").read_text(encoding="utf-8")
    assert '"--log-config", "log_config.json"' in dockerfile


def test_configure_logging_installs_exactly_one_json_handler():
    configure_logging("INFO")
    root = logging.getLogger()
    handlers = [h for h in root.handlers if isinstance(h.formatter, JsonFormatter)]
    assert len(handlers) == 1
    assert any(isinstance(f, RedactionFilter) for f in handlers[0].filters)


# --- the correlation id ---------------------------------------------------------------------


@pytest.fixture
def log_stream(client: TestClient) -> Iterator[io.StringIO]:
    """Redirect the stream the application's own handler writes to, after the lifespan has
    installed it. Everything the app logs from here on is captured, fixtures included."""
    buffer = io.StringIO()
    root = logging.getLogger()
    installed = [h for h in root.handlers if isinstance(h.formatter, JsonFormatter)]
    assert installed, "the lifespan did not install the JSON handler"
    previous = [(h, h.stream) for h in installed]
    for handler, _ in previous:
        handler.setStream(buffer)
    try:
        yield buffer
    finally:
        for handler, stream in previous:
            handler.setStream(stream)


def test_the_response_carries_the_request_id(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    request_id = response.headers[REQUEST_ID_HEADER]
    assert re.fullmatch(rf"[0-9a-f]{{{REQUEST_ID_LENGTH}}}", request_id)


def test_two_requests_get_two_different_ids(client: TestClient):
    first = client.get("/health").headers[REQUEST_ID_HEADER]
    second = client.get("/health").headers[REQUEST_ID_HEADER]
    assert first != second


def test_every_line_of_a_request_carries_that_request_s_id(
    client: TestClient, log_stream: io.StringIO
):
    body = {"username": "nobody", "password": "wrong"}
    response = client.post("/auth/login", json=body)
    assert response.status_code == 401
    request_id = response.headers[REQUEST_ID_HEADER]

    # The application's own lines. The test client's httpx logger shares this stream, which
    # is exactly what "one stream" means, but it speaks from outside the request.
    lines = [line for line in emitted(log_stream) if line["logger"].startswith("app.")]
    assert [line["message"] for line in lines] == ["login rejected"]
    assert {line["request_id"] for line in lines} == {request_id}


def test_a_line_logged_outside_a_request_simply_has_no_id(client: TestClient):
    """The id is request-scoped, so a startup line has none. An absent field is honest; an
    empty or invented one would look like a request that never happened."""
    with isolated_logger() as (logger, stream):
        logger.info("startup complete")

    (line,) = emitted(stream)
    assert "request_id" not in line


# --- the adversarial proof --------------------------------------------------------------------


def test_no_credential_reaches_the_log_stream(
    client: TestClient, log_stream: io.StringIO, registered: dict[str, str]
):
    """Drive the credential-handling endpoints and read everything that was written.

    The fixture order matters: `log_stream` is instantiated before `registered`, so the
    registration, the login and the API-key fetch that create these credentials are captured
    too, not just the calls made below.
    """
    headers = {"Authorization": f"Bearer {registered['token']}"}
    credentials = {"username": registered["username"], "password": registered["password"]}

    assert client.post("/auth/login", json=credentials).status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 200
    assert client.get("/auth/apikey", headers=headers).status_code == 200

    rotated = client.post("/auth/apikey/regenerate", headers=headers)
    assert rotated.status_code == 200
    new_key = rotated.json()["api_key"]
    assert client.get("/tasks", headers={"X-Api-Key": new_key}).status_code == 200

    assert (
        client.put(
            "/auth/password",
            headers=headers,
            json={
                "current_password": registered["password"],
                "new_password": "a different long passphrase",
            },
        ).status_code
        == 200
    )

    # Wrong passwords, past the limit, so the rejected and throttled paths both run.
    wrong = {"username": registered["username"], "password": "not the password"}
    statuses = {client.post("/auth/login", json=wrong).status_code for _ in range(12)}
    assert statuses == {401, 429}

    written = log_stream.getvalue()
    lines = emitted(log_stream)

    # Not vacuous: the endpoints really did log, and every line is well formed.
    messages = {line["message"] for line in lines}
    assert {
        "account registered",
        "login succeeded",
        "api key regenerated",
        "login rejected",
        "login throttled",
    } <= messages

    for secret in (
        registered["api_key"],
        registered["token"],
        registered["password"],
        new_key,
        "a different long passphrase",
        "not the password",
        settings.jwt_secret,
    ):
        assert secret not in written, f"{secret[:12]}... reached the log stream"
