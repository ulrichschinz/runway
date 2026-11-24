"""Provisioning an account's Taskwarrior store.

Since brief 0065 (SEC-001) a store is created only in the storage-id layout,
`DATA_ROOT/<storage_id>/`. Nothing creates `DATA_ROOT/<username>/` any more: the legacy layout
exists only for accounts created before the switch, until the migration has copied them.
"""

import shutil
from pathlib import Path

from app import task_storage
from app.task_storage import Account, TaskStore

TASKRC_TEMPLATE = Path(__file__).parent.parent.parent / "taskrc_template.txt"


def provision_store(account: Account) -> TaskStore:
    """Create the account's empty store and install the `.taskrc` template.

    `mkdir` without `exist_ok`: a directory already carrying this id is not ours to adopt, so it
    is an error rather than a store somebody else may have prepared. Mode 0700 because the
    process is the only reader there should ever be.
    """
    path = task_storage.storage_dir(account.storage_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.mkdir(mode=0o700)
    shutil.copy(TASKRC_TEMPLATE, path / task_storage.TASKRC_NAME)
    return TaskStore(task_storage.checked_directory(path), account.username)
