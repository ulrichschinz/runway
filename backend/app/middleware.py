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
