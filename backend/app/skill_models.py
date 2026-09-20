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
    """Which build of the server is answering."""

    commit: str = Field(
        description="The commit this image was built from, or 'dev' when it was not built "
        "by the deploy workflow."
    )


class SkillInfo(BaseModel):
    """What `GET /skill` answers with."""

    skill: SkillRelease
    server: ServerBuild
    download: str = Field(
        description="Path to the zip, as a client behind the /api prefix reaches it."
    )
