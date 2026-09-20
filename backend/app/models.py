from pydantic import BaseModel, Field

# The complete set of roles. Two is deliberate: `admin` may administer other users and
# site settings, `user` may not. Every place that writes a role — the API, the bootstrap
# and the CLI escape hatch — validates against this tuple, so adding a third role is one
# edit rather than a search.
VALID_ROLES: tuple[str, ...] = ("admin", "user")


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
        default=None, description=f"{_D_DESCRIPTION} Null or omitted leaves it unchanged."
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


class BrainstormItem(BaseModel):
    id: str
    text: str


class ProjectCreate(BaseModel):
    name: str


class ProjectPlan(BaseModel):
    project_name: str
    purpose: str = ""
    principles: str = ""
    vision: str = ""
    brainstorm: list[BrainstormItem] = []
    organized: list[BrainstormItem] = []
    updated_at: str | None = None


class ProjectPlanUpdate(BaseModel):
    purpose: str | None = None
    principles: str | None = None
    vision: str | None = None
    brainstorm: list[BrainstormItem] | None = None
    organized: list[BrainstormItem] | None = None


class ApiKeyInfo(BaseModel):
    api_key: str
