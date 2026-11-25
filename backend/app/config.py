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
    # The login budget (SEC-8, REV-003, brief 0069): failed or in-flight attempts allowed per
    # window before /auth/login answers 429 — per normalised username, per network source, and
    # in total. A success clears the username's count only. Covers every password verification:
    # the login and the current-password check of PUT /auth/password.
    login_rate_limit: int = 10
    login_rate_window_seconds: int = 300
    login_source_rate_limit: int = 30
    # Sized from the KDF, not from the account budget: one failed verification measured 0.26 s
    # of event-loop time, so 300 per 300 s window is about a quarter of it (brief 0069, R2).
    login_global_rate_limit: int = 300
    # The most usernames, and separately the most sources, the limiter holds at once. A new one
    # beyond that is refused (429), never made room for by forgetting an old one.
    login_rate_max_keys: int = 10000
    # Comma-separated addresses or CIDR networks of the proxies in front of the backend whose
    # X-Forwarded-For is believed. Empty: none is, and the socket peer is the source. A
    # malformed entry, or a network of prefix length 0, is ignored and reported at startup.
    trusted_proxies: str = ""
    # Which Taskwarrior directory layout is served (ADR 0043, finding SEC-001). `compat` serves
    # an account not yet migrated from DATA_ROOT/<username>/ when that name is one safe path
    # component; `strict` serves only DATA_ROOT/<storage_id>/. New accounts never use the old
    # layout in either mode. Anything unrecognised is treated as `strict`. `compat` is the
    # shim SHIM-SEC-007 and expires with it.
    task_storage_mode: str = "compat"
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
