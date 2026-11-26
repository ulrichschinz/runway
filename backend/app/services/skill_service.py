"""The skill the server speaks, packaged as the server ships it.

A client that drives runway through MCP needs the skill text that matches the operations
this particular server has. The repository is one source for it and it moves with `main`;
the running server is the other, and it is the one the client is actually talking to. This
module is that second source: the version, the content hash and the build commit of what is
mounted right here, plus a deterministic zip of the skill tree (ADR 0040). The hash covers
what a plugin update delivers — `skills/` and `hooks/` — while the zip carries the skill
alone, because a hook is a plugin mechanism and the zip is for clients that have no plugins
(ADR 0041).

Stdlib only, and no Taskwarrior anywhere near it — architecture.toml withholds
be/adapters/task from this unit, so that is a rule rather than a habit.

The content hash duplicates `tools/checks/skill_surface.py::_content_hash` on purpose: that
file is a gate script outside the backend's import path, and a backend that imported it
would make the shipped image depend on the tooling tree. `backend/tests/unit/test_skill.py`
runs both over the same tree and fails when they disagree, which is what keeps the copy
honest.
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from functools import lru_cache
from pathlib import Path

from app.skill_models import ServerBuild, SkillInfo, SkillRelease

FEATURE = "skill"


def _app_root(module: Path) -> Path:
    """The directory the application tree is copied into: `/app` in the image, `backend/` here.

    It takes the module's path as an argument instead of reading `__file__`, because the
    layout that matters is the one no test tier can assemble: `backend/Dockerfile.test` has
    `./backend` as its context, so in every test run `integrations/` is somewhere else and
    the image branch below is dead code. A wrong number of parents would then be invisible
    until a deployed `GET /skill` answered 503 with every gate green. The container tier
    hands this function a tmp tree shaped like the image's instead, which is a test that a
    miscount fails.
    """
    return module.resolve().parents[2]


_APP_ROOT = _app_root(Path(__file__))


def _candidates() -> tuple[Path, ...]:
    """Where the skill tree sits, in the two places this module ever runs.

    In the image, `backend/app/` is copied to `/app/app/` and the skill to
    `/app/integrations/claude`; in a checkout, the repository root one level above holds it.
    Both are derived from this file's own location, so neither depends on the working
    directory — and both are read at call time, so a test can move the root.
    """
    return (
        _APP_ROOT / "integrations" / "claude",
        _APP_ROOT.parent / "integrations" / "claude",
    )


# The zip's fixed timestamp. A zip records an mtime per entry, and a file's mtime is the
# moment `docker build` copied it — so without this, two images built from one commit would
# serve different bytes, and the ETag would stop meaning "this content".
_EPOCH = (1980, 1, 1, 0, 0, 0)

# What a plugin update delivers, and therefore what the release hash covers. Kept in the
# same order the gate script uses it in; the digest sorts by path either way.
_RELEASED = ("hooks", "skills")


class SkillNotBundled(RuntimeError):
    """The image was built without the skill tree.

    A `.dockerignore` that stops admitting `integrations/claude` — or one of its three parts,
    the skill text, the hooks or the plugin manifest — produces an image that builds, starts
    and serves every other route, so the failure has to be loud at the one route that depends
    on it, and 503 (not 404) says "this server, not this path".
    """


def _root() -> Path:
    for candidate in _candidates():
        if candidate.is_dir():
            return candidate
    raise SkillNotBundled(
        "this build does not carry the Claude skill — the image is missing "
        "integrations/claude; install the skill from the repository instead"
    )


# The deploy compose as the image carries it (backend/Dockerfile) and as the host applied it: the
# deploy compose mounts its own file there read-only (ops/deploy/docker-compose.yml, brief 0073).
BAKED_COMPOSE = Path("/opt/stack/docker-compose.yml")
APPLIED_COMPOSE = Path("/etc/runway/applied-compose.yml")


# The schema version the lifespan's init_db() left the database at (ADR 0047). Handed in by
# `app.main` rather than read from app.database, so this unit adds no importer to that hub.
_schema_version: int | None = None


def record_schema_version(version: int | None) -> None:
    global _schema_version
    _schema_version = version


def _build_id_file() -> Path:
    """`/app/BUILD_ID`, written beside BUILD_COMMIT from `ARG RUNWAY_BUILD` (the workflow run id)."""
    return _APP_ROOT / "BUILD_ID"


def _sha256_of(path: Path) -> str | None:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def _build_id() -> str:
    stamp = _build_id_file()
    if not stamp.is_file():
        return "dev"
    return stamp.read_text(encoding="utf-8").strip() or "dev"


def _build_commit_file() -> Path:
    """`/app/BUILD_COMMIT`, written as the image's last layer from `ARG RUNWAY_COMMIT`.

    A file rather than an environment variable: `RULE-SURF-002` holds `README.md` and the
    settings object together in both directions, and a build stamp is not configuration.
    """
    return _APP_ROOT / "BUILD_COMMIT"


def _tree(plugin: Path, name: str) -> list[Path]:
    """Every file of one delivered directory, in one stable order — never an empty list.

    The Dockerfile copies the skill text, the hooks and the plugin manifest on separate
    lines, which `.dockerignore` admits on separate lines, so an image can lose one part and
    keep the others. The missing manifest already raises. These are the other parts, and
    they would otherwise be silent: `rglob` on a directory that does not exist yields
    nothing rather than raising, so the hash would be one taken over fewer files and the
    zip a valid archive with nothing in it — a release record that is confidently wrong,
    served with 200. An incomplete tree is not a release, so it is `SkillNotBundled` like
    the rest.
    """
    files = sorted(
        p for p in (plugin / name).rglob("*") if p.is_file() and "__pycache__" not in p.parts
    )
    if not files:
        raise SkillNotBundled(
            f"this build carries the plugin manifest but no {name}/ — the skill is "
            f"incomplete, because the image is missing integrations/claude/{name}; install "
            "the skill from the repository instead"
        )
    return files


def _skill_files(plugin: Path) -> list[Path]:
    """The skill text — what the zip contains, named relative to `skills/`."""
    return _tree(plugin, "skills")


def _content_hash(plugin: Path) -> str:
    """sha256 over every file the plugin delivers, path and bytes, in a stable order.

    The released tree is `skills/` **and** `hooks/`: a plugin update carries both, so a hook
    that changed without a version bump reaches nobody, exactly as a skill edit would not
    (`RULE-SURF-004`). Paths are relative to `integrations/claude/`, which is what makes the
    two directories distinguishable inside one digest. The zip is skill-only all the same —
    a hook is a Claude Code plugin mechanism, and the zip exists for clients that have none.
    """
    digest = hashlib.sha256()
    files = [path for name in _RELEASED for path in _tree(plugin, name)]
    for path in sorted(files, key=lambda p: p.relative_to(plugin).as_posix()):
        digest.update(path.relative_to(plugin).as_posix().encode() + b"\0")
        digest.update(path.read_bytes() + b"\0")
    return digest.hexdigest()


def _version(plugin: Path) -> str:
    manifest = plugin / ".claude-plugin" / "plugin.json"
    if not manifest.is_file():
        raise SkillNotBundled("this build carries the skill without its plugin manifest")
    return str(json.loads(manifest.read_text(encoding="utf-8"))["version"])


def _commit() -> str:
    stamp = _build_commit_file()
    if not stamp.is_file():
        return "dev"
    return stamp.read_text(encoding="utf-8").strip() or "dev"


def skill_info() -> SkillInfo:
    """Which skill this server carries, and which build is carrying it."""
    plugin = _root()
    return SkillInfo(
        skill=SkillRelease(
            name="runway",
            version=_version(plugin),
            sha256=_content_hash(plugin),
        ),
        server=ServerBuild(
            commit=_commit(),
            build=_build_id(),
            compose_sha256=_sha256_of(BAKED_COMPOSE),
            applied_compose_sha256=_sha256_of(APPLIED_COMPOSE),
            schema_version=_schema_version,
        ),
        # Absolute and prefixed, because the SPA and every external client reach this
        # application under /api; nginx strips the prefix before it arrives here, so the
        # path this process sees is never the path a client can use.
        download="/api/skill/runway.zip",
    )


@lru_cache(maxsize=2)
def _zip_bytes(plugin: Path) -> bytes:
    """Build the archive once per tree. Cached because the tree is read-only in an image."""
    skills = plugin / "skills"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in _skill_files(plugin):
            info = zipfile.ZipInfo(path.relative_to(skills).as_posix(), date_time=_EPOCH)
            info.compress_type = zipfile.ZIP_DEFLATED
            # 0o644 in the high half of external_attr, so an extracted file is readable
            # rather than inheriting whatever the builder's umask produced.
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())
    return buffer.getvalue()


def skill_zip() -> bytes:
    """The skill tree as a zip whose bytes depend only on its content."""
    return _zip_bytes(_root())
