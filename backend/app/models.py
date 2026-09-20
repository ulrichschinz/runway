import re
from typing import Literal

from pydantic import BaseModel, Field

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
_DATE_FORMAT = "`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, in the server's local time."
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
    description: str = Field(description=_D_DESCRIPTION)
    project: str | None = Field(default=None, description=f"{_D_PROJECT} Empty means none.")
    tags: list[str] = Field(default=[], description=_D_TAGS_CREATE)
    priority: str | None = Field(default=None, description=f"{_D_PRIORITY} Empty means none.")
    due: str | None = Field(default=None, description=_D_DUE)
    scheduled: str | None = Field(default=None, description=_D_SCHEDULED)
    wait: str | None = Field(default=None, description=_D_WAIT)
    until: str | None = Field(default=None, description=_D_UNTIL)
    recur: str | None = Field(default=None, description=_D_RECUR)
    depends: list[str] = Field(default=[], description=_D_DEPENDS)


class TaskModify(BaseModel):
    description: str | None = Field(
        default=None,
        description=f"{_D_DESCRIPTION} Null, omitted or empty leaves it unchanged: a "
        "description can be replaced, never cleared.",
    )
    project: str | None = Field(default=None, description=f"{_D_PROJECT} {_CLEARS}")
    tags: list[str] | None = Field(default=None, description=_D_TAGS_MODIFY)
    priority: str | None = Field(default=None, description=f"{_D_PRIORITY} {_CLEARS}")
    due: str | None = Field(default=None, description=f"{_D_DUE} {_CLEARS} {_RECURRING_KEEPS}")
    scheduled: str | None = Field(default=None, description=f"{_D_SCHEDULED} {_CLEARS}")
    wait: str | None = Field(default=None, description=f"{_D_WAIT} {_CLEARS}")
    until: str | None = Field(default=None, description=f"{_D_UNTIL} {_CLEARS}")
    recur: str | None = Field(default=None, description=f"{_D_RECUR} {_CLEARS} {_RECURRING_KEEPS}")
    depends: list[str] | None = Field(
        default=None,
        description="The complete set of UUIDs of tasks that must be done first: a UUID not "
        "listed is dropped. An empty list clears it; null or omitted leaves it unchanged.",
    )
    tags_add: list[str] | None = Field(
        default=None,
        max_length=50,
        description="Tags to add, leaving every other tag as it is. Cannot be combined "
        "with `tags`, which is the complete set and replaces the current one.",
    )
    tags_remove: list[str] | None = Field(
        default=None,
        max_length=50,
        description="Tags to remove, leaving every other tag as it is; an absent tag is "
        "ignored. Cannot be combined with `tags`.",
    )


class AnnotationCreate(BaseModel):
    text: str


class UserCreate(BaseModel):
    username: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105  # OAuth token type name, not a credential


class UserInfo(BaseModel):
    username: str
    role: str = "user"
    full_name: str = ""
    email: str = ""


class UserProfileUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class SiteSettings(BaseModel):
    allow_registration: bool


class RoleUpdate(BaseModel):
    role: str  # validated against VALID_ROLES in the handler


# A project plan follows the GTD Natural Planning Model, and the five fields only make sense
# under those names. An agent reads them from here, so each says what belongs in it; the two
# lists say that they are replaced whole, because "update the plan" otherwise reads as "append".
_D_PLAN_LIST = "The complete list: what you send replaces the stored one. Omitted or null keeps it."
_D_PLAN_TEXT = "Omitted or null keeps the stored text; an empty string clears it."


class BrainstormItem(BaseModel):
    id: str = Field(description="Identifier of the item, unique within the list. Any string.")
    text: str = Field(description="One idea, or one organized step, as free text.")


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
    brainstorm: list[BrainstormItem] = []
    organized: list[BrainstormItem] = []
    updated_at: str | None = None


class ProjectPlanUpdate(BaseModel):
    purpose: str | None = Field(
        default=None,
        description=f"Why the project exists — the outcome it serves. {_D_PLAN_TEXT}",
    )
    principles: str | None = Field(
        default=None,
        description=f"The standards and constraints the work has to hold to. {_D_PLAN_TEXT}",
    )
    vision: str | None = Field(
        default=None,
        description="What success looks like, described as if it had already happened. "
        f"{_D_PLAN_TEXT}",
    )
    brainstorm: list[BrainstormItem] | None = Field(
        default=None,
        description=f"Unsorted ideas, in no particular order. {_D_PLAN_LIST}",
    )
    organized: list[BrainstormItem] | None = Field(
        default=None,
        description=f"The ideas worth keeping, in the order they will be acted on. {_D_PLAN_LIST}",
    )


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
    api_key: str
