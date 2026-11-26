import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

from app.auth import (
    PASSWORD_GIVEN_MAX_BYTES,
    PASSWORD_MAX_BYTES,
    PASSWORD_MIN_BYTES,
    password_problem,
)

# A project name we write, filter on, or put into a URL path (D4, ADR 0038). What it excludes,
# and why: control characters and newlines (they would split an argument vector or a log line);
# parentheses, quotes and `:` (Taskwarrior's own filter grammar reads them, so `project.is:a:b`
# or `a)` would be parsed rather than matched); a backslash; and `/ ? # %`, because fastapi-mcp
# 0.4.0 substitutes a path parameter into the URL without encoding it, so a project named `a/b`
# would address a different route over MCP. Spaces, umlauts, dots and semicolons are allowed —
# they are ordinary characters in a project name and survive both boundaries. A leading `+`,
# `-` or space is refused (Taskwarrior would read a sign as a modifier), and so is a trailing
# space, which no user can see.
PROJECT_RE = re.compile(r"^(?![+\-\s])[^\x00-\x1f\x7f()\"'\\:/?#%]{1,100}(?<!\s)$")

# Names that would collide with a sibling route rather than reach `{name}`: `/gtd/projects/
# overview` and `/projects/plans/{name}`. Refused only where a name is created on purpose;
# reading or filtering by such a name is merely empty, never dangerous.
RESERVED_PROJECT_NAMES = frozenset({"overview", "plans"})

# Field limits (RISK-SEC-004, plan M8, brief 0073). The body limit (`app.middleware`) bounds a
# request; these bound a field, so a single value cannot grow a user's Taskwarrior store or reach
# the kernel's per-argument limit (`MAX_ARG_STRLEN`, 131 072 bytes on Linux), where `execve` fails
# with E2BIG. Counted in characters, as JSON Schema's `maxLength` is (a description at 4 UTF-8 bytes
# a character is at most 8 000 bytes); a note also in bytes. At or above what the SPA, Android, the
# skill and an agent send; one past a limit is 422, raised while the body is parsed — before any
# handler runs.
DESCRIPTION_MAX = 2_000
# An annotation and an inbox note: what the capture clients send. `capping.js` and Android's
# `Capping.kt` cut a note at 32 KiB of UTF-8 (brief 0052), and the previous deploy accepted that,
# so the bound is the same 32 KiB — in bytes, the clients' rule, with the character count as the
# `maxLength` JSON Schema can state. 32 KiB is a quarter of `MAX_ARG_STRLEN`.
ANNOTATION_MAX = 32 * 1024
ANNOTATION_MAX_BYTES = 32 * 1024
# A username as a request gives it. Registration still refuses more than `USERNAME_MAX` (64) with
# its 400; this bound only stops a name of any size reaching the audit row and the log line that
# login and registration write before any check runs. Generous, so no account is locked out.
USERNAME_GIVEN_MAX = 256
DATE_FIELD_MAX = 64
PRIORITY_MAX = 16
TAG_MAX = 100
TAGS_MAX_ITEMS = 50
DEPENDS_ID_MAX = 64
DEPENDS_MAX_ITEMS = 100
PROFILE_NAME_MAX = 200
EMAIL_MAX = 320
ROLE_MAX = 32
PLAN_TEXT_MAX = 20_000
PLAN_ITEM_ID_MAX = 200
PLAN_ITEM_TEXT_MAX = 4_000
PLAN_LIST_MAX_ITEMS = 500

# What the previous deploy may already have stored (second review of brief 0073). It had none of the
# bounds above, and the SPA resends a task's description, tags and depends and a plan's texts and
# lists whole on every save, so a bound applied to the stored value would make such a task or plan
# uneditable — not even its due date could change. **Only what changes is held to a bound** (the rule
# `_tag_diff` already follows for legacy tags, D3); a value equal to the stored one is kept. The
# request models of an update therefore carry only these ceilings, and the router or service compares
# with what is stored. A task's text reached Taskwarrior as one argument, so nothing stored is longer
# than the kernel's per-argument limit; a plan arrived in one body of at most the 1 MiB body limit.
STORED_ARG_MAX = 131_072
STORED_PLAN_VALUE_MAX = 1024 * 1024


class LimitExceeded(ValueError):
    """A changed value over its bound: 422 in FastAPI's validation shape, naming `field`."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field


Tag = Annotated[str, Field(max_length=TAG_MAX)]
StoredTag = Annotated[str, Field(max_length=STORED_ARG_MAX)]


def _within_note_bytes(value: str) -> str:
    if len(value.encode()) > ANNOTATION_MAX_BYTES:
        raise ValueError(f"at most {ANNOTATION_MAX_BYTES} bytes in UTF-8")
    return value


NoteText = Annotated[
    str,
    Field(
        max_length=ANNOTATION_MAX,
        description=f"At most {ANNOTATION_MAX_BYTES} bytes in UTF-8 (the capture clients' rule).",
    ),
    AfterValidator(_within_note_bytes),
]
DependsId = Annotated[str, Field(max_length=DEPENDS_ID_MAX)]

# The complete set of roles. Two is deliberate: `admin` may administer other users and
# site settings, `user` may not. Every place that writes a role — the API, the bootstrap
# and the CLI escape hatch — validates against this tuple, so adding a third role is one
# edit rather than a search.
VALID_ROLES: tuple[str, ...] = ("admin", "user")


def validate_project_name(name: str, reserved: bool = False) -> str:
    """Return `name` if it is a project name this API will write or filter on.

    It lives here, in `be/leaves`, rather than in the task service, so the project router
    can reach it without the services layer gaining an importer it does not need.

    `reserved=True` additionally refuses the two names that would address a sibling route.
    Pass it where a name is *created*; never where one is read or filtered, so a name that
    already exists stays reachable.
    """
    if not PROJECT_RE.fullmatch(name):
        raise ValueError(f"Invalid project name: {name!r}")
    if reserved and name in RESERVED_PROJECT_NAMES:
        raise ValueError(f"Reserved project name: {name!r}")
    return name


class TaskAnnotation(BaseModel):
    entry: str
    description: str


class Task(BaseModel):
    uuid: str
    id: int
    description: str
    status: str
    urgency: float = 0.0
    project: str | None = None
    tags: list[str] = []
    priority: str | None = None
    due: str | None = None
    scheduled: str | None = None
    wait: str | None = None
    until: str | None = None
    recur: str | None = None
    depends: list[str] = []
    annotations: list[TaskAnnotation] = []
    start: str | None = None
    entry: str | None = None
    modified: str | None = None
    end: str | None = None


# Field descriptions reach MCP clients through the OpenAPI schema, so they are the only
# documentation an agent sees. Generic on purpose (RISK-MCP-002): what a field means and
# accepts, nothing about the deployment.
_DATE_FORMAT = (
    "`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, in the server's local time. Other Taskwarrior date "
    "expressions are accepted as one word (`tomorrow`, `eom`, `now+3d`); a value with spaces is "
    "refused (400)."
)
_CLEARS = "On modify, an empty string clears it; null or omitted leaves it unchanged."
_RECURRING_KEEPS = "A recurring task cannot lose it (400)."

_D_DESCRIPTION = "What the task is, as free text. Never parsed for tags or attributes."
_D_PROJECT = "Project name; dots nest subprojects (`home.garden`)."
_D_PRIORITY = "`H`, `M` or `L`. New tasks have no priority unless one is given."
_D_DUE = f"Hard deadline only: the date by which it must be done. {_DATE_FORMAT}"
_D_SCHEDULED = f"Earliest start, or the day to follow up; does not hide the task. {_DATE_FORMAT}"
_D_WAIT = f"Hides the task from every list until this date (tickler). {_DATE_FORMAT}"
_D_UNTIL = f"The task expires and is deleted after this date. {_DATE_FORMAT}"
_D_RECUR = (
    "Repeat interval: `daily`, `weekly`, `monthly`, `yearly`, or e.g. `2d`, `3 weeks`. Needs `due`."
)
_D_TAGS_CREATE = (
    "Tags, written without `+`. Status tags are `next`, `waiting`, `someday`; contexts are "
    "`@name` (`@home`)."
)
_D_TAGS_MODIFY = (
    "The complete tag set, written without `+`: tags not listed are removed, so this "
    "overwrites changes made elsewhere. To change single tags use `tags_add` / `tags_remove`."
)
_D_DEPENDS = "UUIDs of tasks that must be done first."


class TaskCreate(BaseModel):
    description: str = Field(max_length=DESCRIPTION_MAX, description=_D_DESCRIPTION)
    project: str | None = Field(default=None, description=f"{_D_PROJECT} Empty means none.")
    tags: list[Tag] = Field(default=[], max_length=TAGS_MAX_ITEMS, description=_D_TAGS_CREATE)
    priority: str | None = Field(
        default=None, max_length=PRIORITY_MAX, description=f"{_D_PRIORITY} Empty means none."
    )
    due: str | None = Field(default=None, max_length=DATE_FIELD_MAX, description=_D_DUE)
    scheduled: str | None = Field(default=None, max_length=DATE_FIELD_MAX, description=_D_SCHEDULED)
    wait: str | None = Field(default=None, max_length=DATE_FIELD_MAX, description=_D_WAIT)
    until: str | None = Field(default=None, max_length=DATE_FIELD_MAX, description=_D_UNTIL)
    recur: str | None = Field(default=None, max_length=DATE_FIELD_MAX, description=_D_RECUR)
    depends: list[DependsId] = Field(
        default=[], max_length=DEPENDS_MAX_ITEMS, description=_D_DEPENDS
    )


_KEPT = "a value equal to the stored one is kept whatever its size."


class TaskModify(BaseModel):
    description: str | None = Field(
        default=None,
        max_length=STORED_ARG_MAX,
        description=f"{_D_DESCRIPTION} Null, omitted or empty leaves it unchanged: a "
        f"description can be replaced, never cleared. A new description is at most "
        f"{DESCRIPTION_MAX} characters (422); {_KEPT}",
    )
    project: str | None = Field(default=None, description=f"{_D_PROJECT} {_CLEARS}")
    tags: list[StoredTag] | None = Field(
        default=None,
        description=f"{_D_TAGS_MODIFY} A tag the task does not carry yet is at most {TAG_MAX} "
        f"characters, and the set may not grow past {TAGS_MAX_ITEMS} tags (422); tags it already "
        "carries are kept.",
    )
    priority: str | None = Field(
        default=None, max_length=PRIORITY_MAX, description=f"{_D_PRIORITY} {_CLEARS}"
    )
    due: str | None = Field(
        default=None,
        max_length=DATE_FIELD_MAX,
        description=f"{_D_DUE} {_CLEARS} {_RECURRING_KEEPS}",
    )
    scheduled: str | None = Field(
        default=None, max_length=DATE_FIELD_MAX, description=f"{_D_SCHEDULED} {_CLEARS}"
    )
    wait: str | None = Field(
        default=None, max_length=DATE_FIELD_MAX, description=f"{_D_WAIT} {_CLEARS}"
    )
    until: str | None = Field(
        default=None, max_length=DATE_FIELD_MAX, description=f"{_D_UNTIL} {_CLEARS}"
    )
    recur: str | None = Field(
        default=None,
        max_length=DATE_FIELD_MAX,
        description=f"{_D_RECUR} {_CLEARS} {_RECURRING_KEEPS}",
    )
    depends: list[DependsId] | None = Field(
        default=None,
        description="The complete set of UUIDs of tasks that must be done first: a UUID not "
        "listed is dropped. An empty list clears it; null or omitted leaves it unchanged. The "
        f"set may not grow past {DEPENDS_MAX_ITEMS} (422).",
    )
    tags_add: list[Tag] | None = Field(
        default=None,
        max_length=TAGS_MAX_ITEMS,
        description="Tags to add, leaving every other tag as it is. Cannot be combined "
        "with `tags`, which is the complete set and replaces the current one.",
    )
    tags_remove: list[StoredTag] | None = Field(
        default=None,
        description="Tags to remove, leaving every other tag as it is; an absent tag is "
        "ignored. Cannot be combined with `tags`.",
    )


class AnnotationCreate(BaseModel):
    text: NoteText


def _checked(new: bool):
    def check(value: str) -> str:
        problem = password_problem(value, new=new)
        if problem:
            raise ValueError(problem)
        return value

    return check


# Password fields are bounded in UTF-8 bytes (finding SEC-006, ADR 0044 Decision 5). The schema's
# `maxLength` counts characters, and N bytes are never more than N characters, so it is a true
# (weaker) bound that pydantic checks first; the validator then counts bytes. A refusal is 422,
# raised while the body is parsed — before any hash is computed or any row is read. A password
# being set is at most 1024 bytes; one being given (login, current password) at most 4096, the
# bound the previous image enforced, so no account that logged in before is refused here (R7).
_SET_RULE = (
    f"{PASSWORD_MIN_BYTES} to {PASSWORD_MAX_BYTES} bytes in UTF-8 (counted in bytes, not "
    "characters), no NUL character. For up to 7 days after the server's password-hashing upgrade, "
    "shorter than 72 bytes."
)
NewPassword = Annotated[
    str,
    Field(max_length=PASSWORD_MAX_BYTES, description=f"The password to set: {_SET_RULE}"),
    AfterValidator(_checked(new=True)),
]
GivenPassword = Annotated[
    str,
    Field(
        max_length=PASSWORD_GIVEN_MAX_BYTES,
        description=f"At most {PASSWORD_GIVEN_MAX_BYTES} bytes in UTF-8. No minimum: a password "
        "set before the rule still works.",
    ),
    AfterValidator(_checked(new=False)),
]


GivenUsername = Annotated[str, Field(max_length=USERNAME_GIVEN_MAX)]


class UserCreate(BaseModel):
    username: GivenUsername
    password: NewPassword


class UserLogin(BaseModel):
    username: GivenUsername
    password: GivenPassword


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105  # OAuth token type name, not a credential
    password_change_required: bool = Field(
        default=False,
        description="True when this login was accepted by a pre-2026-11 bcrypt hash for a "
        "password of 72 bytes or more. bcrypt read only its first 72 bytes, so the stored hash "
        "cannot be upgraded from it: set a new password (PUT /auth/password). After a "
        "transition window such a login is refused.",
    )
    # The signed-in account's stable id, as in `UserInfo.account_id`: the SPA binds its browser
    # namespace at login, so a failed `GET /auth/me` leaves no unbound window (brief 0075).
    account_id: str | None = None


class UserInfo(BaseModel):
    username: str
    role: str = "user"
    full_name: str = ""
    email: str = ""
    # The account's stable id (`users.id`, AUTOINCREMENT, so never handed out twice), as an
    # opaque string. The SPA namespaces the account's browser data by it rather than by the
    # username, which a deleted account frees for someone else (brief 0075, ADR 0050).
    account_id: str | None = None
    # When the account was created (UTC, ISO 8601 with `Z`). An unsent op the browser kept from
    # before that moment belongs to an earlier account of the same username, never to this one
    # (the legacy migration's proof, ADR 0050). Only `GET /auth/me` fills it.
    created_at: str | None = None


class UserProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=PROFILE_NAME_MAX)
    email: str | None = Field(default=None, max_length=EMAIL_MAX)


class PasswordChange(BaseModel):
    current_password: GivenPassword
    new_password: NewPassword


class SiteSettings(BaseModel):
    allow_registration: bool


class RoleUpdate(BaseModel):
    role: str = Field(max_length=ROLE_MAX)  # validated against VALID_ROLES in the handler


# A project plan follows the GTD Natural Planning Model, and the five fields only make sense
# under those names. An agent reads them from here, so each says what belongs in it; the two
# lists say that they are replaced whole, because "update the plan" otherwise reads as "append".
_D_PLAN_LIST = "The complete list: what you send replaces the stored one. Omitted or null keeps it."
_D_PLAN_TEXT = "Omitted or null keeps the stored text; an empty string clears it."


class StoredBrainstormItem(BaseModel):
    """One item of a stored plan, as it is read back: unbounded, because a plan written before the
    limits (brief 0073) must still be readable — a response that failed its own model would be a 500."""

    id: str = Field(description="Identifier of the item, unique within the list. Any string.")
    text: str = Field(description="One idea, or one organized step, as free text.")


class BrainstormItem(BaseModel):
    """One item of a plan being written. A new item is bounded; an item the stored plan already
    holds is kept as it is."""

    id: str = Field(
        max_length=STORED_PLAN_VALUE_MAX,
        description="Identifier of the item, unique within the list. Any string; a new one is at "
        f"most {PLAN_ITEM_ID_MAX} characters.",
    )
    text: str = Field(
        max_length=STORED_PLAN_VALUE_MAX,
        description="One idea, or one organized step, as free text; a new one is at most "
        f"{PLAN_ITEM_TEXT_MAX} characters.",
    )


class ProjectCreate(BaseModel):
    name: str = Field(
        description="Project name, spelled exactly as tasks spell it; dots nest subprojects "
        "(`home.garden`). Surrounding whitespace is removed."
    )


class ProjectPlan(BaseModel):
    project_name: str
    purpose: str = ""
    principles: str = ""
    vision: str = ""
    brainstorm: list[StoredBrainstormItem] = []
    organized: list[StoredBrainstormItem] = []
    updated_at: str | None = None


_D_PLAN_TEXT_BOUND = (
    f"A new text is at most {PLAN_TEXT_MAX} characters (422); one equal to the stored text is kept."
)
_D_PLAN_LIST_BOUND = (
    f"A list may not grow past {PLAN_LIST_MAX_ITEMS} items (422); items the plan already holds, in "
    "either list, are kept whatever their size."
)


class ProjectPlanUpdate(BaseModel):
    purpose: str | None = Field(
        default=None,
        max_length=STORED_PLAN_VALUE_MAX,
        description=f"Why the project exists — the outcome it serves. {_D_PLAN_TEXT} "
        f"{_D_PLAN_TEXT_BOUND}",
    )
    principles: str | None = Field(
        default=None,
        max_length=STORED_PLAN_VALUE_MAX,
        description=f"The standards and constraints the work has to hold to. {_D_PLAN_TEXT} "
        f"{_D_PLAN_TEXT_BOUND}",
    )
    vision: str | None = Field(
        default=None,
        max_length=STORED_PLAN_VALUE_MAX,
        description="What success looks like, described as if it had already happened. "
        f"{_D_PLAN_TEXT} {_D_PLAN_TEXT_BOUND}",
    )
    brainstorm: list[BrainstormItem] | None = Field(
        default=None,
        description=f"Unsorted ideas, in no particular order. {_D_PLAN_LIST} {_D_PLAN_LIST_BOUND}",
    )
    organized: list[BrainstormItem] | None = Field(
        default=None,
        description="The ideas worth keeping, in the order they will be acted on. "
        f"{_D_PLAN_LIST} {_D_PLAN_LIST_BOUND}",
    )


PLAN_TEXT_FIELDS = ("purpose", "principles", "vision")
PLAN_LIST_FIELDS = ("brainstorm", "organized")


def plan_limit_problem(update: ProjectPlanUpdate, stored: ProjectPlan) -> LimitExceeded | None:
    """The first changed value of `update` over its bound, or None.

    A text equal to the stored one is not checked. An item id or text the stored plan holds, in
    either list (an item moves from brainstorm to organized), is not checked. A list longer than the
    bound is refused only when it is longer than the larger of the stored lists too, so a plan that
    already holds more items stays editable and may shrink, never grow past both."""
    for name in PLAN_TEXT_FIELDS:
        value = getattr(update, name)
        if value is not None and len(value) > PLAN_TEXT_MAX and value != getattr(stored, name):
            return LimitExceeded(name, f"String should have at most {PLAN_TEXT_MAX} characters")
    items = [*stored.brainstorm, *stored.organized]
    known_ids = {i.id for i in items}
    known_texts = {i.text for i in items}
    held = max(len(stored.brainstorm), len(stored.organized))
    for name in PLAN_LIST_FIELDS:
        values = getattr(update, name)
        if values is None:
            continue
        if len(values) > PLAN_LIST_MAX_ITEMS and len(values) > held:
            return LimitExceeded(
                name, f"List should have at most {PLAN_LIST_MAX_ITEMS} items, not {len(values)}"
            )
        for item in values:
            if len(item.id) > PLAN_ITEM_ID_MAX and item.id not in known_ids:
                return LimitExceeded(
                    name, f"An item id should have at most {PLAN_ITEM_ID_MAX} characters"
                )
            if len(item.text) > PLAN_ITEM_TEXT_MAX and item.text not in known_texts:
                return LimitExceeded(
                    name, f"An item text should have at most {PLAN_ITEM_TEXT_MAX} characters"
                )
    return None


# The GTD summary: what a review or a reminder needs before it decides whether to fetch
# anything at all. Counters, one timestamp and project names — never a task description.
# That is what makes it safe to print from a shell hook in a logged repository, and the
# reason every field below is a number, a date or a name.
_D_SUMMARY_SCOPE = "Narrowed by `tag` where the summary was called with one."


class LastReview(BaseModel):
    daily: str | None = Field(
        default=None,
        description="When the last daily review was recorded, `YYYYMMDDTHHMMSSZ` (UTC), or "
        "null if none was.",
    )
    weekly: str | None = Field(
        default=None,
        description="When the last weekly review was recorded, `YYYYMMDDTHHMMSSZ` (UTC), or "
        "null if none was.",
    )


class GtdSummary(BaseModel):
    today: str = Field(
        description="The server's current date, `YYYY-MM-DD`. Every day "
        "counter below is relative to it."
    )
    inbox: int = Field(
        description="Unprocessed tasks: no project, no tags, not hidden by a "
        "`wait` date. Never narrowed by `tag` — the inbox is untagged by definition."
    )
    inbox_oldest_entry: str | None = Field(
        default=None,
        description="When the oldest inbox task was captured, `YYYYMMDDTHHMMSSZ` (UTC), or "
        "null if the inbox is empty. An old entry is the finding, not the count.",
    )
    overdue: int = Field(
        description=f"Open tasks whose `due` day is before today. {_D_SUMMARY_SCOPE}"
    )
    due_today: int = Field(description=f"Open tasks whose `due` day is today. {_D_SUMMARY_SCOPE}")
    next: int = Field(description=f"Visible tasks tagged `next`. {_D_SUMMARY_SCOPE}")
    waiting: int = Field(
        description=f"Open tasks tagged `waiting`, hidden ones included. {_D_SUMMARY_SCOPE}"
    )
    waiting_followup_due: int = Field(
        description="Tasks tagged `waiting` whose `scheduled` follow-up day is today or "
        f"earlier. {_D_SUMMARY_SCOPE}"
    )
    someday: int = Field(description=f"Visible tasks tagged `someday`. {_D_SUMMARY_SCOPE}")
    hidden: int = Field(
        description=f"Tasks parked in the tickler by a future `wait` date. {_D_SUMMARY_SCOPE}"
    )
    tickler_returned_today: int = Field(
        description=f"Tasks whose `wait` date passed today, so they are back. {_D_SUMMARY_SCOPE}"
    )
    scheduled_passed: int = Field(
        description="Visible tasks that are not `waiting` and whose `scheduled` day is today "
        f"or earlier — they could have been started. {_D_SUMMARY_SCOPE}"
    )
    unclarified: int = Field(
        description="Visible tasks with tags but no project and none of `next`, `waiting` or "
        f"`someday`: in no GTD list at all. {_D_SUMMARY_SCOPE}"
    )
    stalled_projects: list[str] = Field(
        description="Names of active projects with no `next` action, nothing `waiting` and "
        "nothing parked in the tickler. Names only, no tasks."
    )
    last_review: LastReview = Field(description="When reviews were last recorded.")


# A review timestamp: the one piece of GTD state the task store cannot hold. "When did I last
# look at all of this" is a fact about the reviewing, not about any task, and deriving it from
# the newest `modified` date — which is what an agent has to do without this — answers a
# different question, because touching one task is not reviewing the lists.
_D_SCOPE = (
    "Which part of the system the review covered: the scope tags, sorted and joined with `+` "
    "(`@work+ar`), or empty for the whole system. Order and duplicates do not matter; the "
    "server returns the canonical form, which is what the summary's `tag` resolves to."
)


class ReviewCreate(BaseModel):
    kind: Literal["daily", "weekly"] = Field(
        description="`daily` for the short daily pass, `weekly` for the full weekly review."
    )
    scope: str = Field(default="", max_length=200, description=_D_SCOPE)


class Review(BaseModel):
    kind: str = Field(description="`daily` or `weekly`.")
    scope: str = Field(description=_D_SCOPE)
    reviewed_at: str = Field(description="When this review was recorded, `YYYYMMDDTHHMMSSZ` (UTC).")


# A project's status, and the counts a review reads it with. Taskwarrior holds no notion of a
# project beyond the string on a task, so "this one is deliberately parked" has nowhere to
# live in the task data — and without it every project without a next action looks stalled,
# which is the finding a review exists to produce and therefore the one that must be right.
_D_PROJECT_STATUS = (
    "`active` — it is running and needs a next action; `on_hold` — deliberately parked, so "
    "it is never reported as stalled; `done` — the outcome was reached or dropped. A project "
    "nobody has said anything about is `active`."
)


class ProjectStatusUpdate(BaseModel):
    status: Literal["active", "on_hold", "done"] = Field(description=_D_PROJECT_STATUS)


class ProjectStatus(BaseModel):
    name: str = Field(description="The project the status belongs to, spelled as tasks spell it.")
    status: str = Field(description=_D_PROJECT_STATUS)


class ProjectOverview(BaseModel):
    name: str = Field(description="The project name, spelled as tasks spell it.")
    status: str = Field(description=_D_PROJECT_STATUS)
    explicit: bool = Field(
        description="True when the project was created on purpose or has a plan; false when "
        "it exists only because tasks name it. Both are real projects."
    )
    has_plan: bool = Field(
        description="True when any plan field (purpose, principles, vision, brainstorm, "
        "organized) is filled."
    )
    pending: int = Field(
        description="Open tasks that are visible — not parked by a future `wait` date."
    )
    next: int = Field(description="Visible tasks tagged `next`: the project's next actions.")
    waiting: int = Field(description="Open tasks tagged `waiting`, hidden ones included.")
    hidden: int = Field(description="Tasks parked in the tickler by a future `wait` date.")
    stalled: bool = Field(
        description="True when the project is `active` and has no `next` action, nothing "
        "`waiting` and nothing parked in the tickler. Nothing is moving it."
    )


class ApiKeyInfo(BaseModel):
    """The deprecated shape of `GET /auth/apikey` and `POST /auth/apikey/regenerate`."""

    api_key: str


# --- hashed API keys (WAIVER-SEC-003, ADR 0044 Decision 6, brief 0070) ------------------------

API_KEY_MAX_DAYS = 365


class ApiKeyCreate(BaseModel):
    label: str = Field(
        "",
        max_length=64,
        description="A name for the key, to tell several apart (for example `laptop agent`).",
    )
    expires_in_days: int = Field(
        API_KEY_MAX_DAYS,
        ge=1,
        le=API_KEY_MAX_DAYS,
        description="Days until the key stops working, 1 to 365.",
    )


class ApiKeyMetadata(BaseModel):
    """What can be known about a key without holding it: never the secret, never its hash."""

    key_id: str = Field(description="The key's public id; part of the key itself.")
    label: str
    kind: Literal["issued", "legacy"] = Field(
        description="`legacy`: a key issued before keys were hashed, valid until the cutoff."
    )
    prefix: str = Field(
        description="The key's public beginning, `rwk_<key_id>`, to recognise it; empty for a "
        "legacy key, which has no public part."
    )
    created_at: str = Field(description="ISO 8601, UTC.")
    expires_at: str | None = Field(description="ISO 8601, UTC.")
    revoked_at: str | None = Field(description="ISO 8601, UTC; null while not revoked.")
    last_used_at: str | None = Field(
        description="ISO 8601, UTC, to the minute; null if never used."
    )
    state: Literal["active", "expired", "revoked"]


class ApiKeyCreated(ApiKeyMetadata):
    api_key: str = Field(
        description="The key. Shown in this response only: it is stored as a hash and cannot "
        "be retrieved again."
    )
