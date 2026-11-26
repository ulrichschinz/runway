"""The shapes the skill feature speaks in.

They live beside app/models.py rather than inside it: that file is the shared DTO kernel
every router depends on, and it is allowlisted as a hub for exactly that reason. A shape
becomes shared when a second unit needs it, which is a move somebody makes on purpose.

Nothing here is user data. `GET /skill` is unauthenticated (ADR 0040), so every field below
is something the repository already publishes: a skill version, a hash of public text, and
the commit the image was built from.
"""

from pydantic import BaseModel, Field


class SkillRelease(BaseModel):
    """Which release of the Claude skill this server carries."""

    name: str = Field(description="The skill's directory name inside the zip — always 'runway'.")
    version: str = Field(
        description="The plugin version, from integrations/claude/.claude-plugin/plugin.json."
    )
    sha256: str = Field(
        description="Content hash of the skill tree, identical to ops/skill-release.json."
    )


class ServerBuild(BaseModel):
    """Which build of the server is answering, under which configuration (RISK-OPS-002, brief 0073).

    Hashes and numbers only: never a file, a path on the host or a value from its `.env`.
    """

    commit: str = Field(
        description="The commit this image was built from, or 'dev' when it was not built "
        "by the deploy workflow."
    )
    build: str = Field(
        default="dev",
        description="The id of the deploy-workflow run that built this image, or 'dev'. Only the "
        "image that run pushed carries it.",
    )
    compose_sha256: str | None = Field(
        default=None,
        description="SHA-256 of the deploy compose file baked into this image, or null.",
    )
    applied_compose_sha256: str | None = Field(
        default=None,
        description="SHA-256 of the compose file the host applied, as mounted read-only into the "
        "container, or null when it is not mounted.",
    )
    schema_version: int | None = Field(
        default=None,
        description="The schema version this process left its database at, or null before it "
        "has initialised one.",
    )


class SkillInfo(BaseModel):
    """What `GET /skill` answers with."""

    skill: SkillRelease
    server: ServerBuild
    download: str = Field(
        description="Path to the zip, as a client behind the /api prefix reaches it."
    )
