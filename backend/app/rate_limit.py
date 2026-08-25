"""A fixed-window attempt counter for the login route (finding SEC-8).

`POST /auth/login` had no limit of any kind, so a password could be brute-forced at whatever
rate the network allowed. bcrypt makes each attempt cost something, which is a cost ceiling,
not a control: it slows an attacker down without ever stopping one.

Keyed by **username**, not by IP. An attacker who can rotate source addresses defeats an
IP-keyed limiter without slowing down, and the thing being protected is an account rather
than a network location. The cost of that choice is stated plainly: someone who knows a
username can lock it out of password login for the window. That is survivable here because
API keys are checked before any password path and are unaffected, so agents, MCP clients and
the webhook keep working through a lockout — and because decision F1 puts this at one
operator with two accounts, where a denial-of-service against a known username is a smaller
risk than an unthrottled guess against an unknown password.

In-process and per-worker on purpose. It resets on restart and does not coordinate across
processes, which is the correct amount of machinery for a single-host single-worker
deployment (F1) and the wrong amount for anything larger. Recorded as `RISK-SEC-003`.
"""

from __future__ import annotations

import time
from collections import defaultdict

from app.config import settings

# username -> timestamps of failed attempts still inside the window
_failures: dict[str, list[float]] = defaultdict(list)


def _now() -> float:
    return time.monotonic()


def _prune(username: str, now: float) -> list[float]:
    window = settings.login_rate_window_seconds
    kept = [t for t in _failures[username] if now - t < window]
    if kept:
        _failures[username] = kept
    else:
        _failures.pop(username, None)
    return kept


def seconds_until_retry(username: str) -> int:
    """0 when a login attempt is allowed, otherwise how long to wait.

    Checked *before* the password is verified, so a locked-out username costs no bcrypt work
    — otherwise the limiter would still hand an attacker the CPU cost as a lever.
    """
    now = _now()
    recent = _prune(username, now)
    if len(recent) < settings.login_rate_limit:
        return 0
    oldest = min(recent)
    return max(1, int(settings.login_rate_window_seconds - (now - oldest)) + 1)


def record_failure(username: str) -> None:
    """Only failures count. A correct password never consumes the budget, so an active user
    is not throttled by their own successful logins."""
    now = _now()
    _prune(username, now)
    _failures[username].append(now)


def clear(username: str) -> None:
    """Called on a successful login: proving the password resets the budget."""
    _failures.pop(username, None)


def reset_all() -> None:
    """Test seam. Module state outlives a TestClient, so a suite that logs in repeatedly
    would otherwise trip the limiter in whichever test happened to run tenth."""
    _failures.clear()
