#!/bin/sh
# SessionStart hook: one line when a GTD review is due, and nothing at all otherwise.
#
# A skill is loaded only when it triggers, so it can never say "your inbox has been sitting
# there for nine days" at the moment a session starts. A hook can — and a hook is a shell
# command, so it talks to the REST routes `GET /api/gtd/summary` and `GET /api/gtd/review`
# with curl, never to an MCP tool. See ADR 0041.
#
# Two environment variables, both read from the user's shell profile:
#
#   RUNWAY_URL       the origin of the runway server, e.g. https://runway.example.com
#   RUNWAY_API_KEY   the key from that server's settings page
#
# SILENCE IS THE DEFAULT, and it is the whole design. This runs before every session in
# every repository; a line that is wrong, late or merely chatty is a line people remove the
# hook over. So it says nothing at all when either variable is unset, when curl or python3
# is missing, on any HTTP error, on a timeout, on unparsable JSON — and, most importantly,
# when nothing is due. It always exits 0: a non-zero exit from a SessionStart hook is a
# message of its own, and "runway is unreachable" is not worth one.
#
# It prints counters only. The summary carries no task titles, and the one field that names
# anything — `stalled_projects` — is deliberately not read, so this is safe to run in a
# repository whose sessions are logged. `integrations/claude/tests/hook_test.sh` holds every
# one of these promises (RULE-TEST-005).
set -u

[ -n "${RUNWAY_URL:-}" ] || exit 0
[ -n "${RUNWAY_API_KEY:-}" ] || exit 0
command -v curl >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

# -f so a 401 or a 502 is a failure rather than a body to parse, -sS so curl itself stays
# quiet, -m 2 so a slow server costs the session four seconds across the two calls and not
# the 5-second timeout in hooks.json, which is the backstop and not the budget.
# The key travels in a header; it is never in the URL, and never printed.
api() {
	curl -fsS -m 2 -H "X-Api-Key: $RUNWAY_API_KEY" "${RUNWAY_URL%/}/api/gtd/$1" 2>/dev/null
}

# Two questions, two routes. The counters come from the summary. The review records come
# from `GET /api/gtd/review`, which lists every scope: reviews are stored per scope key
# (ADR 0041, Decision 2) and this hook has no repository scope to ask about, so the summary's
# own `last_review` — the unscoped record and nothing else — would be empty forever for
# anyone whose repositories declare `runway_scope`, and the reminder would never go quiet.
summary=$(api summary) || exit 0
reviews=$(api review) || exit 0
[ -n "$summary" ] || exit 0
[ -n "$reviews" ] || exit 0

RUNWAY_SUMMARY="$summary" RUNWAY_REVIEWS="$reviews" python3 -c '
import json
import os
from datetime import datetime, timedelta, timezone

# Any surprise in either payload means silence: a hook that prints a traceback at the top of
# every session is worse than one that prints nothing. `inbox` is what makes the first body
# the summary rather than an error object that happens to be JSON.
try:
    s = json.loads(os.environ["RUNWAY_SUMMARY"])
    rows = json.loads(os.environ["RUNWAY_REVIEWS"])
    if not isinstance(s, dict) or "inbox" not in s or not isinstance(rows, list):
        raise ValueError("not the summary")
except Exception:
    raise SystemExit(0)

# The one clock. Every review record is a UTC stamp, so every comparison here is a duration
# between two UTC instants — never a day sliced out of a stamp and held against the summary
# `today`, which is the local day of the server. Those two disagree between local midnight and
# the UTC offset, and the disagreement would remind the user of a review they had just
# finished. That is how a reminder loses its meaning.
now = datetime.now(timezone.utc)


def newest(kind):
    """The newest recorded review of one kind, in any scope, or None.

    Any scope, because the hook does not know the repository it is starting in and cannot:
    `runway_scope` is a line in the instructions of a repository, read by an agent and not
    by a shell command. For a reminder, a review recorded anywhere is a review.
    """
    stamps = []
    for row in rows:
        if not isinstance(row, dict) or row.get("kind") != kind:
            continue
        try:
            stamps.append(
                datetime.strptime(str(row.get("reviewed_at")), "%Y%m%dT%H%M%SZ").replace(
                    tzinfo=timezone.utc
                )
            )
        except Exception:
            continue
    return max(stamps) if stamps else None


def counter(key):
    value = s.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else 0


daily = newest("daily")
weekly = newest("weekly")

# What a daily review would actually find. No open loop, nothing to say: an empty inbox with
# nothing overdue is a reason to stay quiet, not a reason to report a zero.
found = [
    f"{label} {counter(key)}"
    for key, label in (
        ("inbox", "inbox"),
        ("overdue", "overdue"),
        ("due_today", "due today"),
        ("waiting_followup_due", "follow-ups"),
    )
    if counter(key)
]

due = []
if found and (daily is None or now - daily > timedelta(hours=24)):
    due.append("daily review due — " + ", ".join(found))
if weekly is None:
    # Never recorded is the most overdue a weekly review can be. It goes quiet after the
    # first one, which is one call the skill makes at the end of every weekly review.
    due.append("no weekly review recorded yet")
elif now - weekly > timedelta(days=10):
    due.append(f"weekly review {(now - weekly).days} days ago")

if due:
    print("runway: " + "; ".join(due))
' 2>/dev/null

exit 0
