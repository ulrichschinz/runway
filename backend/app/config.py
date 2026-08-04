from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    jwt_secret: str = "changeme-please-set-in-env"  # noqa: S105  # WAIVER-SEC-001 — Step 11 makes this fatal
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24
    data_root: Path = Path("/app/data")
    db_path: str = "/app/users.db"
    allow_registration: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
