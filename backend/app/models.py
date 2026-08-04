from pydantic import BaseModel


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


class TaskCreate(BaseModel):
    description: str
    project: str | None = None
    tags: list[str] = []
    priority: str | None = None  # H, M, L
    due: str | None = None
    scheduled: str | None = None
    wait: str | None = None
    until: str | None = None
    recur: str | None = None
    depends: list[str] = []


class TaskModify(BaseModel):
    description: str | None = None
    project: str | None = None
    tags: list[str] | None = None
    priority: str | None = None
    due: str | None = None
    scheduled: str | None = None
    wait: str | None = None
    until: str | None = None
    recur: str | None = None
    depends: list[str] | None = None


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
    role: str  # "admin" or "user"


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
