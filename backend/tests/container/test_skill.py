"""Container-tier coverage for the skill routes.

`backend/Dockerfile.test` builds with `./backend` as its context, so the skill tree the
shipped image carries at `/app/integrations/claude` is **not** here. That is the point of
this file rather than a gap in it: what the unit tier cannot show is that ``skill_service``
derives the image's layout correctly — that `/app/app/services/skill_service.py` leads to
`/app/integrations/claude` and `/app/BUILD_COMMIT` — and that it says so instead of guessing
when the tree is absent. Both are exercised against a tmp tree shaped like the image's, with
the real candidate walk rather than a replaced ``_root``: in a checkout the image candidate
is dead code, so a wrong number of parents would be invisible in every tier and would first
appear as a deployed 503 (ADR 0040).

The real image is proven in production instead, by the `verify-deploy` job (ADR 0040).
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest

from app.services import skill_service

pytestmark = pytest.mark.container

COMMIT = "deadbeefcafe"


def _image(root: Path, version: str = "9.9.9") -> Path:
    """Build what `backend/Dockerfile` puts in the image, at the paths it puts it at.

    `/app` holds the application under `app/`, the skill at `integrations/claude` and the
    build stamp at `BUILD_COMMIT`. The application file is empty on purpose — only its
    position is under test.
    """
    app = root / "app"
    (app / "app" / "services").mkdir(parents=True)
    (app / "app" / "services" / "skill_service.py").write_text("", encoding="utf-8")
    plugin = app / "integrations" / "claude"
    skill = plugin / "skills" / "runway"
    (skill / "references").mkdir(parents=True)
    (skill / "SKILL.md").write_text("# runway\n", encoding="utf-8")
    (skill / "references" / "conventions.md").write_text("conventions\n", encoding="utf-8")
    (plugin / ".claude-plugin").mkdir(parents=True)
    (plugin / ".claude-plugin" / "plugin.json").write_text(
        json.dumps({"name": "runway", "version": version}), encoding="utf-8"
    )
    (app / "BUILD_COMMIT").write_text(f"{COMMIT}\n", encoding="utf-8")
    return app


def test_the_feature_module_is_present_in_the_image():
    from app.routers import skill  # noqa: F401

    assert skill_service.FEATURE == "skill"


def test_the_routes_are_mounted_on_the_application():
    """Read from the served schema, not from ``app.routes``.

    The scaffold's generated version of this test walks ``app.routes``, which under the
    pinned FastAPI holds one opaque ``_IncludedRouter`` per ``include_router`` call and no
    route paths at all — so it would pass for a feature that is not mounted. The schema is
    what a client sees.
    """
    from app.main import app

    assert {"/skill", "/skill/runway.zip"} <= set(app.openapi()["paths"])


def test_the_application_root_is_the_directory_the_dockerfile_copies_into(tmp_path):
    """The one assertion no other tier can make: the parent count against the image's tree.

    ``COPY backend/app/ ./app/`` with ``WORKDIR /app`` puts this module at
    `/app/app/services/skill_service.py`, two directories below the root that holds the
    skill and the build stamp. Off by one and the shipped image answers 503 forever, and the
    build commit reads `dev`; in a checkout nothing notices, because the second candidate
    resolves and every test stays green.
    """
    app = _image(tmp_path)

    assert skill_service._app_root(app / "app" / "services" / "skill_service.py") == app
    assert skill_service._APP_ROOT == skill_service._app_root(Path(skill_service.__file__))


def test_a_bundle_beside_the_application_is_found_read_and_zipped(tmp_path, monkeypatch):
    """The whole chain against the image's layout: root, candidates, manifest, stamp, zip."""
    app = _image(tmp_path)
    module = app / "app" / "services" / "skill_service.py"
    # Derived, not written out: the root under test is the one the module's own position
    # produces, so the candidate walk below runs against a real derivation.
    monkeypatch.setattr(skill_service, "_APP_ROOT", skill_service._app_root(module))
    skill_service._zip_bytes.cache_clear()

    assert skill_service._root() == app / "integrations" / "claude"
    info = skill_service.skill_info()
    assert info.skill.version == "9.9.9"
    assert info.server.commit == COMMIT
    with zipfile.ZipFile(io.BytesIO(skill_service.skill_zip())) as archive:
        assert archive.namelist() == ["runway/SKILL.md", "runway/references/conventions.md"]
    skill_service._zip_bytes.cache_clear()


def test_an_image_without_the_bundle_says_so_rather_than_guessing(tmp_path, monkeypatch):
    monkeypatch.setattr(skill_service, "_APP_ROOT", tmp_path / "app")
    with pytest.raises(skill_service.SkillNotBundled):
        skill_service._root()
