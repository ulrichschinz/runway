from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Still a working default so `import app.main` succeeds without an environment — but
    # startup now refuses it. See startup_checks.assert_jwt_secret_is_safe (finding SEC-1).
    jwt_secret: str = "changeme-please-set-in-env"  # noqa: S105  # a known default, rejected at boot
    # Read only to refuse it (finding SEC-002, brief 0072, ADR 0046): tokens are signed and verified
    # with JWT_SIGNING_ALGORITHM below, never with this. Anything but "HS256" refuses to start. Kept so
    # a .env that still sets it keeps booting — pydantic-settings refuses an unknown dotenv key —
    # until the contract step of SHIM-SEC-010 removes it.
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
    # The day (UTC, YYYY-MM-DD) from which an API key issued before hashed keys existed is
    # refused (WAIVER-SEC-003, ADR 0044 Decision 6). It can move the cutoff EARLIER than the
    # default, never later: a later or malformed value is ignored and reported at startup —
    # every old backup holds these keys, so a knob that extended them would be the wrong knob.
    api_key_legacy_cutoff: str = "2027-01-15"
    # The MCP transport's budget (REV-004, brief 0071, ADR 0045): MCP requests allowed in flight
    # at once, in total and per network source (the source as the login budget determines it,
    # TRUSTED_PROXIES included). A request above either is refused before any other work, 503 or
    # 429. A quarter of the total is the most that requests without a credential header may hold.
    mcp_max_inflight: int = 32
    mcp_source_max_inflight: int = 8
    # The size of DATA_ROOT/audit.db (with its -wal and -shm) above which the hourly measurement
    # logs a WARNING instead of INFO (RISK-OPS-006, brief 0073, ADR 0047). 100 MiB is the risk's own
    # re-open trigger. A measurement only: nothing deletes audit rows until the retention decision
    # (gate D7) is taken.
    audit_db_warn_bytes: int = 100 * 1024 * 1024
    # How much of the JSON log stream is emitted. The *format* is not configurable and
    # neither is the redaction filter: a setting that turns a control off is the setting
    # that gets turned off at 3am. An unrecognised value falls back to INFO rather than
    # refusing to boot — see logging_setup.resolve_level.
    log_level: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()

# The one algorithm a token of this server is signed and verified with (SEC-002, ADR 0046). A constant,
# not a setting: the verifier's algorithm must not be a function of the deployment's environment.
JWT_SIGNING_ALGORITHM = "HS256"


def cors_origin_list() -> list[str]:
    """The configured origins, as a list. Empty means no cross-origin access at all."""
    return [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
