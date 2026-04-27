import shutil
from pathlib import Path
from app.config import settings

TASKRC_TEMPLATE = Path(__file__).parent.parent.parent / "taskrc_template.txt"


def init_user_data(username: str) -> None:
    user_dir = settings.data_root / username
    user_dir.mkdir(parents=True, exist_ok=True)
    taskrc = user_dir / ".taskrc"
    if not taskrc.exists():
        shutil.copy(TASKRC_TEMPLATE, taskrc)
