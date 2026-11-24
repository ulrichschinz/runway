"""A correlation id per request: on every line logged while it runs, and on the response.

Without one, a JSON log stream is a pile of independent facts. With one, "the login at 14:02
failed and then /tasks returned 500" becomes a query, and a user reporting a problem can
quote the id from the response header instead of describing what they were doing.

It lands now rather than with the audit log because it is the thing the audit log will join
on: Step 15c's rows carry the same id, so an audit event ties to the lines around it. Adding
it afterwards would mean either a period of audit rows that correlate with nothing, or a
retrofit of every line that had already been written.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from starlette.datastructures import MutableHeaders

from app.logging_setup import REQUEST_ID_HEADER, current_request_id

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]

# 48 bits of randomness. Long enough that a collision inside any window an operator would
# search, short enough that someone can read it off a screen and type it into a chat message
# — which is the only reason it is on the response at all.
REQUEST_ID_LENGTH = 12


def new_request_id() -> str:
    return uuid.uuid4().hex[:REQUEST_ID_LENGTH]


class RequestIdMiddleware:
    """Assign an id, publish it to the log formatter, echo it on the response.

    Written against the raw ASGI interface rather than Starlette's `BaseHTTPMiddleware`, and
    that is the whole point of it. `BaseHTTPMiddleware` runs the handler in a child task and
    returns before the response is actually sent, so a context variable set there is already
    reset by the time uvicorn writes its access line — the one line per request that is
    guaranteed to exist would be the one line without a correlation id. Here `send` is
    uvicorn's own, called inside this context, so the access line carries the id too.

    The id is always generated here and never taken from the request. An inbound
    `X-Request-Id` is attacker-controlled text that would be copied verbatim into every log
    line of the request, which is how a log-injection reads; the id this service needs is one
    it minted itself.
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = new_request_id()
        context = current_request_id.set(request_id)

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message).append(REQUEST_ID_HEADER, request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            current_request_id.reset(context)


# --- the request-body limit (finding SEC-006, brief 0067) ------------------------------------
#
# The earliest edge this repository controls in front of every route, and the only one in front
# of a caller that reaches the backend directly on the shared Docker network rather than through
# nginx. 1 MiB is nginx's default `client_max_body_size`, so nothing the SPA path could already
# send is refused here; the auth routes carry a username and at most two 1024-byte passwords,
# so 16 KiB is generous for them and small enough that a login cannot make the server parse a
# large document. Uniform limits on the other fields are M8's (RISK-SEC-004).
AUTH_BODY_LIMIT = 16 * 1024
DEFAULT_BODY_LIMIT = 1024 * 1024


def body_limit_for(path: str) -> int:
    return AUTH_BODY_LIMIT if path == "/auth" or path.startswith("/auth/") else DEFAULT_BODY_LIMIT


async def _refuse(send: Send, status: int, detail: str) -> None:
    body = ('{"detail":"' + detail + '"}').encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"connection", b"close"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class BodyLimitMiddleware:
    """Refuse a request body over its limit with 413 before any route, parser, hash or query runs.

    A declared `Content-Length` over the limit is refused without reading a byte (the server
    enforces that the body matches what was declared). A body without one — chunked — is read
    here up to the limit and replayed to the application, and refused the moment it passes the
    limit, so an oversized chunked body is never held in full.
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = body_limit_for(scope.get("path", ""))
        declared = None
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                declared = value
                break
        if declared is not None:
            try:
                size = int(declared)
            except ValueError:
                await _refuse(send, 400, "Invalid Content-Length")
                return
            if size > limit:
                await _refuse(send, 413, "Request body too large")
                return
            await self.app(scope, receive, send)
            return

        chunks: list[bytes] = []
        total = 0
        while True:
            message = await receive()
            if message["type"] != "http.request":
                return  # the client went away while sending
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > limit:
                await _refuse(send, 413, "Request body too large")
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
