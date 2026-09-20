"""HTTP surface for the skill the server ships.

Two routes, both **open** (ADR 0040): the content is a public repository's skill text and a
public commit sha, a `<a download>` in the settings page cannot send a header, and the
post-deploy check runs before anyone holds a key for the new build. `rules/route-guards.toml`
records that decision with its reason, and `RULE-SEC-001` fails when the two disagree.

The router's tag is `skill`, which is deliberately **not** on the MCP allowlist in
`backend/app/main.py`: an agent that is already connected to this server has the skill, and
a tool that returns a zip is of no use to it (ADR 0037, ADR 0040).

This module stays thin. Anything that is not a translation between HTTP and a call belongs
in app/services/skill_service.py.
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Response

from app.services import skill_service
from app.skill_models import SkillInfo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/skill", tags=["skill"])

_UNBUNDLED: dict[int | str, dict[str, Any]] = {
    503: {"description": "This build does not carry the skill (`SkillNotBundled`)."},
}


@router.get(
    "",
    response_model=SkillInfo,
    summary="The skill this server ships",
    description="Which release of the runway Claude skill this server carries, its content "
    "hash, the commit the image was built from, and where to download it. Unauthenticated: "
    "the answer is public repository content plus a public commit sha.",
    responses=_UNBUNDLED,
)
def skill_info() -> SkillInfo:
    try:
        info = skill_service.skill_info()
    except skill_service.SkillNotBundled as e:
        logger.error("skill not bundled", extra={"detail": str(e)})
        raise HTTPException(status_code=503, detail=str(e)) from e
    logger.info(
        "skill described", extra={"version": info.skill.version, "commit": info.server.commit}
    )
    return info


@router.get(
    "/runway.zip",
    response_class=Response,
    summary="Download the skill",
    description="The skill tree as a zip, with one directory `runway/` inside it, matching "
    "the version this server speaks. Deterministic: the same content always produces the "
    "same bytes, and the ETag is the content hash. Unauthenticated, so a browser link and a "
    "keyless curl both work.",
    responses={
        200: {"content": {"application/zip": {}}, "description": "The skill, zipped."},
        **_UNBUNDLED,
    },
)
def skill_zip() -> Response:
    try:
        info = skill_service.skill_info()
        content = skill_service.skill_zip()
    except skill_service.SkillNotBundled as e:
        logger.error("skill not bundled", extra={"detail": str(e)})
        raise HTTPException(status_code=503, detail=str(e)) from e
    logger.info("skill downloaded", extra={"version": info.skill.version, "bytes": len(content)})
    return Response(
        content=content,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="runway-skill-{info.skill.version}.zip"',
            "ETag": f'"{info.skill.sha256}"',
        },
    )
