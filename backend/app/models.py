from pydantic import BaseModel
from typing import Optional, List


class TaskAnnotation(BaseModel):
    entry: str
    description: str


class Task(BaseModel):
    uuid: str
    id: int
    description: str
    status: str
    urgency: float = 0.0
    project: Optional[str] = None
    tags: list[str] = []
    priority: Optional[str] = None
    due: Optional[str] = None
    scheduled: Optional[str] = None
    wait: Optional[str] = None
    until: Optional[str] = None
    recur: Optional[str] = None
    depends: list[str] = []
    annotations: list[TaskAnnotation] = []
    start: Optional[str] = None
    entry: Optional[str] = None
    modified: Optional[str] = None


class TaskCreate(BaseModel):
    description: str
    project: Optional[str] = None
    tags: list[str] = []
    priority: Optional[str] = None  # H, M, L
    due: Optional[str] = None
    scheduled: Optional[str] = None
    wait: Optional[str] = None
    until: Optional[str] = None
    recur: Optional[str] = None
    depends: list[str] = []


class TaskModify(BaseModel):
    description: Optional[str] = None
    project: Optional[str] = None
    tags: Optional[list[str]] = None
    priority: Optional[str] = None
    due: Optional[str] = None
    scheduled: Optional[str] = None
    wait: Optional[str] = None
    until: Optional[str] = None
    recur: Optional[str] = None
    depends: Optional[list[str]] = None


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
    token_type: str = "bearer"


class UserInfo(BaseModel):
    username: str


class BrainstormItem(BaseModel):
    id: str
    text: str


class ProjectCreate(BaseModel):
    name: str


class ProjectPlan(BaseModel):
    project_name: str
    purpose: str = ''
    principles: str = ''
    vision: str = ''
    brainstorm: List[BrainstormItem] = []
    organized: List[BrainstormItem] = []
    updated_at: Optional[str] = None


class ProjectPlanUpdate(BaseModel):
    purpose: Optional[str] = None
    principles: Optional[str] = None
    vision: Optional[str] = None
    brainstorm: Optional[List[BrainstormItem]] = None
    organized: Optional[List[BrainstormItem]] = None


class ApiKeyInfo(BaseModel):
    api_key: str
