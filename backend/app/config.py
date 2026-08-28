from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Still a working default so `import app.main` succeeds without an environment — but
    # startup now refuses it. See startup_checks.assert_jwt_secret_is_safe (finding SEC-1).
    jwt_secret: str = "changeme-please-set-in-env"  # noqa: S105  # a known default, rejected at boot
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24
    data_root: Path = Path("/app/data")
    db_path: str = "/app/users.db"
    allow_registration: bool = False
    # Promoted to admin at startup ONLY when the database contains no admin at all.
    # Empty means "never bootstrap". See database.bootstrap_admin and ADR 0017.
    bootstrap_admin: str = ""
    # Comma-separated browser origins allowed to call this API cross-origin. Empty means
    # none, which is correct for every deployment shape this repository ships: the SPA
    # reaches the API through a same-origin /api proxy in production (nginx) and in
    # development (vite), so no browser ever makes a cross-origin request. See ADR 0018.
    cors_origins: str = ""
    # Login attempts allowed per username per window before /auth/login answers 429.
    login_rate_limit: int = 10
    login_rate_window_seconds: int = 300
    # How much of the JSON log stream is emitted. The *format* is not configurable and
    # neither is the redaction filter: a setting that turns a control off is the setting
    # that gets turned off at 3am. An unrecognised value falls back to INFO rather than
    # refusing to boot — see logging_setup.resolve_level.
    log_level: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()


def cors_origin_list() -> list[str]:
    """The configured origins, as a list. Empty means no cross-origin access at all."""
    return [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
