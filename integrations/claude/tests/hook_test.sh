#!/bin/sh
# RULE-TEST-005  runway-summary.sh MUST stay silent unless a review is due, and print
#                counters only — never a task or project name, never the key.
#
# The hook runs before every Claude session in every repository, so its failure modes are
# not "wrong output" but "output at all": a traceback, a curl error, a zero-count report or
# a leaked credential at the top of a session is what makes somebody delete it. Each
# assertion below is one promise from ADR 0041, exercised against a stub `curl` placed first
# on PATH — no network, no server, no key.
#
# Prints one line per failed assertion and exits 1 if any failed; silent and 0 otherwise.
set -eu

HERE=$(cd "$(dirname -- "$0")/.." && pwd)
HOOK="$HERE/hooks/runway-summary.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

failures=0
fail() { printf 'runway-summary.sh: %s\n' "$1"; failures=$((failures + 1)); }

started=$(date +%s)

# The script must parse as POSIX sh (ADR 0001), not merely under a forgiving bash.
if command -v dash >/dev/null 2>&1; then
	dash -n "$HOOK" || fail "does not parse as POSIX sh (dash -n)"
fi

# A key that is recognisable in any output it should never reach.
KEY='s3cr3t-key-never-print-me'
PROJECT='kitchen-remodel'

STUBS="$WORK/bin"
mkdir -p "$STUBS"
ARGS="$WORK/curl-args"

# The stub stands in for the server: it answers each of the two routes with the file named
# by $CANNED_SUMMARY or $CANNED_REVIEW, and behaves like `curl -f` against a 401 or a 502 —
# exit 22, no body — when the file for the route it was asked for is empty. Every argument
# of every call is appended to $ARGS, so a test can assert what was asked of the server.
cat >"$STUBS/curl" <<'STUB'
#!/bin/sh
printf '%s\n' "$@" >>"${ARGS:-/dev/null}"
body=
for arg in "$@"; do
	case "$arg" in
		*/api/gtd/summary) body=${CANNED_SUMMARY:-} ;;
		*/api/gtd/review) body=${CANNED_REVIEW:-} ;;
	esac
done
[ -n "$body" ] || exit 22
cat "$body"
STUB
chmod +x "$STUBS/curl"

canned() { printf '%s' "$2" >"$WORK/$1.json"; printf '%s' "$WORK/$1.json"; }

# Review stamps are UTC instants and the hook compares durations against them, so the
# fixtures are built from the real clock rather than written as fixed digits: a canned
# "2026-09-18" would test a different age every day it is run. `LOCAL_TOMORROW` is the day
# a server an hour east of UTC calls today when `JUST_NOW` was recorded — the summary field
# that a day-slicing hook would compare against, and the one this suite exists to keep it
# from comparing against (see "a review recorded on the other side of local midnight").
python3 - >"$WORK/stamps.sh" <<'PY'
from datetime import datetime, timedelta, timezone

now = datetime.now(timezone.utc)


def stamp(**kw):
    return (now - timedelta(**kw)).strftime("%Y%m%dT%H%M%SZ")


print(f"JUST_NOW={stamp(hours=1)}")
print(f"THIS_MORNING={stamp(hours=6)}")
print(f"YESTERDAY={stamp(hours=30)}")
print(f"THREE_DAYS={stamp(days=3)}")
print(f"NINETEEN_DAYS={stamp(days=19, hours=1)}")
print(f"TODAY={(now - timedelta(hours=1)).date().isoformat()}")
print(f"LOCAL_TOMORROW={(now - timedelta(hours=1) + timedelta(days=1)).date().isoformat()}")
PY
. "$WORK/stamps.sh"

# --- the summaries: counters, and the field with a name in it ------------------
COUNTERS=$(canned counters '{"today":"'"$TODAY"'","inbox":4,"overdue":1,"due_today":0,
 "waiting_followup_due":2,"next":7,"stalled_projects":["kitchen-remodel"],
 "last_review":{"daily":null,"weekly":null}}')
QUIET=$(canned quiet '{"today":"'"$TODAY"'","inbox":0,"overdue":0,"due_today":0,
 "waiting_followup_due":0,"stalled_projects":["kitchen-remodel"],
 "last_review":{"daily":null,"weekly":null}}')
# A summary as a server an hour east of UTC produces it just after local midnight: its
# `today` is already the next day while the review recorded an hour ago still stamps the
# previous UTC day.
MIDNIGHT=$(canned midnight '{"today":"'"$LOCAL_TOMORROW"'","inbox":9,"overdue":3,"due_today":1,
 "waiting_followup_due":0,"stalled_projects":["kitchen-remodel"],
 "last_review":{"daily":null,"weekly":null}}')
GARBAGE=$(canned garbage '<html>502 Bad Gateway</html>')

# --- the review records: one row per kind and scope ----------------------------
# Reviews are stored per scope (ADR 0041), and the hook asks the route that lists every
# scope because it cannot know the scope of the repository the session starts in. So the
# rows below are scoped ones: for a repository that declares `runway_scope`, this is the
# only shape the server ever holds, and the summary's own unscoped `last_review` stays null
# forever — which is why every canned summary above carries exactly that.
CURRENT=$(canned current '[{"kind":"daily","scope":"@work+ar","reviewed_at":"'"$THIS_MORNING"'"},
 {"kind":"weekly","scope":"@work+ar","reviewed_at":"'"$THREE_DAYS"'"}]')
JUST_REVIEWED=$(canned just-reviewed '[{"kind":"daily","scope":"@work+ar","reviewed_at":"'"$JUST_NOW"'"},
 {"kind":"weekly","scope":"@work+ar","reviewed_at":"'"$THREE_DAYS"'"}]')
STALE_DAILY=$(canned stale-daily '[{"kind":"daily","scope":"@work+ar","reviewed_at":"'"$YESTERDAY"'"},
 {"kind":"weekly","scope":"@work+ar","reviewed_at":"'"$THREE_DAYS"'"}]')
STALE_WEEKLY=$(canned stale-weekly '[{"kind":"daily","scope":"@work+ar","reviewed_at":"'"$THIS_MORNING"'"},
 {"kind":"weekly","scope":"@work+ar","reviewed_at":"'"$NINETEEN_DAYS"'"}]')
NEVER=$(canned never '[]')

# run <summary file or ""> <review file or ""> [url] — sets OUT (stdout and stderr together)
# and RC, and resets the record of what was asked of the server.
run() {
	url=${3:-https://runway.example.com}
	: >"$ARGS"
	set +e
	OUT=$(CANNED_SUMMARY="$1" CANNED_REVIEW="$2" ARGS="$ARGS" PATH="$STUBS:$PATH" \
		RUNWAY_URL="$url" RUNWAY_API_KEY="$KEY" sh "$HOOK" 2>&1)
	RC=$?
	set -e
}

lines() {
	[ -n "$1" ] || { printf '0'; return 0; }
	printf '%s\n' "$1" | wc -l | tr -d ' '
}

# silent <label> — the last run must have produced nothing at all and exited 0.
silent() {
	[ -z "$OUT" ] || fail "$1: expected no output, got: $OUT"
	[ "$RC" -eq 0 ] || fail "$1: exited $RC, expected 0"
}

# --- no environment, no call ---------------------------------------------------
set +e
OUT=$(unset RUNWAY_URL; PATH="$STUBS:$PATH" RUNWAY_API_KEY="$KEY" sh "$HOOK" 2>&1)
RC=$?
set -e
silent "without RUNWAY_URL"

set +e
OUT=$(unset RUNWAY_API_KEY; PATH="$STUBS:$PATH" RUNWAY_URL=https://runway.example.com sh "$HOOK" 2>&1)
RC=$?
set -e
silent "without RUNWAY_API_KEY"

# --- no tools, no call ---------------------------------------------------------
# PATH holds the stub curl and nothing else, so python3 is missing. A machine without it
# must produce silence, not "python3: command not found" at the top of the session.
set +e
OUT=$(CANNED_SUMMARY="$COUNTERS" CANNED_REVIEW="$NEVER" ARGS="$ARGS" PATH="$STUBS" \
	RUNWAY_URL=https://runway.example.com RUNWAY_API_KEY="$KEY" /bin/sh "$HOOK" 2>&1)
RC=$?
set -e
silent "without python3 on PATH"

# --- the server says no --------------------------------------------------------
run "" ""
silent "on an HTTP error"

# One of the two routes failing is the same case: an older server without `GET /gtd/review`
# answers 404, and a hook that then guessed would guess in front of everybody.
run "$COUNTERS" ""
silent "when the review route errors"

run "$GARBAGE" "$NEVER"
silent "on a body that is not the summary"

run "$COUNTERS" "$GARBAGE"
silent "on a review list that is not a list"

# --- nothing to report ---------------------------------------------------------
run "$QUIET" "$CURRENT"
silent "when nothing is due"

run "$COUNTERS" "$CURRENT"
silent "when today's daily review is already recorded"

# A scoped review is a review. The summary here is the unscoped one the hook asks for, whose
# `last_review` is null because the user reviews inside a repository that declares
# `runway_scope` — reading dueness off that field would nag this user at every session start
# of every repository, for ever, with no way to silence it.
run "$COUNTERS" "$JUST_REVIEWED"
silent "when the recorded review belongs to a scope"

# A review recorded on the other side of local midnight: one hour ago, stamped in UTC on the
# day before the one the server calls today. Slicing the day out of the stamp and comparing
# it against the summary's `today` would remind the user of a review they had just finished.
run "$MIDNIGHT" "$JUST_REVIEWED"
silent "when the daily review is an hour old but on the previous UTC day"

# --- one line, counters only ---------------------------------------------------
run "$COUNTERS" "$STALE_DAILY"
[ "$RC" -eq 0 ] || fail "when a review is due: exited $RC, expected 0"
[ "$(lines "$OUT")" = "1" ] || fail "when a review is due: expected exactly 1 line, got $(lines "$OUT"): $OUT"
case "$OUT" in
	'runway: daily review due — inbox 4, overdue 1, follow-ups 2') : ;;
	*) fail "when a review is due: unexpected line: $OUT" ;;
esac
case "$OUT" in
	*"$PROJECT"*) fail "printed a project name: $OUT" ;;
esac
case "$OUT" in
	*"$KEY"*) fail "printed the API key: $OUT" ;;
esac

run "$QUIET" "$STALE_WEEKLY"
[ "$(lines "$OUT")" = "1" ] || fail "an overdue weekly review: expected 1 line, got: $OUT"
case "$OUT" in
	'runway: weekly review 19 days ago') : ;;
	*) fail "an overdue weekly review: unexpected line: $OUT" ;;
esac

run "$QUIET" "$NEVER"
[ "$(lines "$OUT")" = "1" ] || fail "a system with no reviews: expected 1 line, got: $OUT"
case "$OUT" in
	'runway: no weekly review recorded yet') : ;;
	*) fail "a system with no reviews: unexpected line: $OUT" ;;
esac

# --- what it asked the server for ----------------------------------------------
# The trailing slash the user left on RUNWAY_URL must not double, the key must travel in a
# header, and the paths must be the two routes without task titles in them.
run "$COUNTERS" "$CURRENT" 'https://runway.example.com/'
grep -qx 'https://runway.example.com/api/gtd/summary' "$ARGS" \
	|| fail "did not call <origin>/api/gtd/summary exactly once per session: $(tr '\n' ' ' <"$ARGS")"
grep -qx 'https://runway.example.com/api/gtd/review' "$ARGS" \
	|| fail "did not call <origin>/api/gtd/review exactly once per session: $(tr '\n' ' ' <"$ARGS")"
grep -qx "X-Api-Key: $KEY" "$ARGS" || fail "did not send the key as an X-Api-Key header"
if grep -q "^https.*$KEY" "$ARGS"; then fail "put the key in the URL, where it would be logged"; fi
grep -qx -- '-m' "$ARGS" || fail "called curl without a timeout (-m)"

# --- fast enough to run before every session -----------------------------------
elapsed=$(( $(date +%s) - started ))
[ "$elapsed" -lt 5 ] || fail "the whole suite took ${elapsed}s; the hook's budget is under 5s"

[ "$failures" -eq 0 ]
