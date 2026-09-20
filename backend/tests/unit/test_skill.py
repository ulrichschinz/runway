"""The server hands out the skill it speaks.

Two routes, both unauthenticated on purpose (ADR 0040). What matters here is that the bytes
are deterministic, that the metadata agrees with the checked-in release record rather than
with a copy of it, and that neither route is reachable as an MCP tool.

The hash algorithm is deliberately duplicated: ``tools/checks/skill_surface.py`` is a gate
script and the backend may not import one. ``TestTheHashAgrees`` is what keeps the copy a
copy — it runs both over the same tree and compares.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest

from app.services import skill_service

ROOT = Path(__file__).resolve().parents[3]
PLUGIN_JSON = ROOT / "integrations" / "claude" / ".claude-plugin" / "plugin.json"


def _release() -> dict:
    return json.loads((ROOT / "ops" / "skill-release.json").read_text(encoding="utf-8"))


def _missing_root() -> Path:
    """What an image built without the admit lines in `.dockerignore` would do."""
    raise skill_service.SkillNotBundled("the skill is not bundled with this image")


@pytest.fixture
def cold_cache():
    """The zip is cached per root; clear it so each test measures a real build."""
    skill_service._zip_bytes.cache_clear()
    yield
    skill_service._zip_bytes.cache_clear()


class TestTheZip:
    def test_is_byte_identical_when_built_twice(self, cold_cache):
        first = skill_service.skill_zip()
        skill_service._zip_bytes.cache_clear()
        assert skill_service.skill_zip() == first

    def test_contains_the_skill_and_nothing_else(self, cold_cache):
        with zipfile.ZipFile(io.BytesIO(skill_service.skill_zip())) as archive:
            names = archive.namelist()
        assert names == sorted(names)
        assert names == [
            "runway/SKILL.md",
            "runway/references/clarify.md",
            "runway/references/conventions.md",
            "runway/references/daily-review.md",
            "runway/references/planning.md",
            "runway/references/setup.md",
            "runway/references/weekly-review.md",
        ]

    def test_carries_the_skill_text_itself(self, cold_cache):
        with zipfile.ZipFile(io.BytesIO(skill_service.skill_zip())) as archive:
            shipped = archive.read("runway/SKILL.md")
        assert (
            shipped
            == (ROOT / "integrations" / "claude" / "skills" / "runway" / "SKILL.md").read_bytes()
        )

    def test_dates_every_entry_to_the_epoch_of_the_format(self, cold_cache):
        """A zip records mtimes, and a rebuilt image would otherwise produce new bytes for
        unchanged content — which would make the ETag and the release hash disagree."""
        with zipfile.ZipFile(io.BytesIO(skill_service.skill_zip())) as archive:
            assert {info.date_time for info in archive.infolist()} == {(1980, 1, 1, 0, 0, 0)}


class TestTheMetadata:
    def test_names_the_released_version(self):
        assert skill_service.skill_info().skill.version == _release()["version"]
        assert (
            skill_service.skill_info().skill.version
            == json.loads(PLUGIN_JSON.read_text(encoding="utf-8"))["version"]
        )

    def test_hashes_the_tree_the_release_record_hashes(self):
        assert skill_service.skill_info().skill.sha256 == _release()["sha256"]

    def test_says_dev_when_the_image_carries_no_build_commit(self, monkeypatch, tmp_path):
        monkeypatch.setattr(skill_service, "_build_commit_file", lambda: tmp_path / "absent")
        assert skill_service.skill_info().server.commit == "dev"

    def test_reports_the_build_commit_the_image_was_built_from(self, monkeypatch, tmp_path):
        stamp = tmp_path / "BUILD_COMMIT"
        stamp.write_text("deadbeef\n", encoding="utf-8")
        monkeypatch.setattr(skill_service, "_build_commit_file", lambda: stamp)
        assert skill_service.skill_info().server.commit == "deadbeef"

    def test_points_at_the_download_behind_the_api_prefix(self):
        assert skill_service.skill_info().download == "/api/skill/runway.zip"


class TestTheHashAgrees:
    def test_the_backend_copy_and_the_gate_script_hash_the_same_tree(self):
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "_skill_surface", ROOT / "tools" / "checks" / "skill_surface.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        assert skill_service.skill_info().skill.sha256 == module._content_hash()


class TestNotBundled:
    def test_the_metadata_route_answers_503(self, client, monkeypatch):
        monkeypatch.setattr(skill_service, "_root", _missing_root)
        r = client.get("/skill")
        assert r.status_code == 503
        assert "skill" in r.json()["detail"].lower()

    def test_the_download_answers_503(self, client, monkeypatch, cold_cache):
        monkeypatch.setattr(skill_service, "_root", _missing_root)
        assert client.get("/skill/runway.zip").status_code == 503


class TestHalfBundled:
    """The manifest arrived and the skill text did not.

    `.dockerignore` admits the two on two lines and the Dockerfile copies them on two, so
    losing one half is likelier than losing both — and this is the half that has nothing to
    trip over: `rglob` on a directory that is not there yields nothing instead of raising.
    Answering 200 with the sha256 of the empty string and a valid, empty zip would be worse
    than 503, because the release record would be wrong rather than absent.
    """

    @pytest.fixture
    def manifest_only(self, tmp_path):
        plugin = tmp_path / "integrations" / "claude"
        (plugin / ".claude-plugin").mkdir(parents=True)
        (plugin / ".claude-plugin" / "plugin.json").write_text(
            json.dumps({"name": "runway", "version": "9.9.9"}), encoding="utf-8"
        )
        return plugin

    def test_the_metadata_route_answers_503(self, client, monkeypatch, manifest_only):
        monkeypatch.setattr(skill_service, "_root", lambda: manifest_only)
        r = client.get("/skill")
        assert r.status_code == 503
        assert "skill" in r.json()["detail"].lower()

    def test_the_download_answers_503(self, client, monkeypatch, cold_cache, manifest_only):
        monkeypatch.setattr(skill_service, "_root", lambda: manifest_only)
        assert client.get("/skill/runway.zip").status_code == 503


class TestTheRoutes:
    def test_the_metadata_needs_no_credential(self, client):
        r = client.get("/skill")
        assert r.status_code == 200
        assert r.json()["skill"]["name"] == "runway"

    def test_the_download_needs_no_credential(self, client, cold_cache):
        r = client.get("/skill/runway.zip")
        assert r.status_code == 200
        assert r.content[:2] == b"PK"

    def test_the_download_is_served_as_a_named_attachment(self, client, cold_cache):
        r = client.get("/skill/runway.zip")
        version = _release()["version"]
        assert r.headers["content-type"] == "application/zip"
        assert r.headers["content-disposition"] == (
            f'attachment; filename="runway-skill-{version}.zip"'
        )

    def test_the_download_carries_the_release_hash_as_its_etag(self, client, cold_cache):
        assert client.get("/skill/runway.zip").headers["etag"] == f'"{_release()["sha256"]}"'

    def test_the_metadata_and_the_download_agree(self, client, cold_cache):
        info = client.get("/skill").json()
        body = client.get(info["download"].removeprefix("/api")).content
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            assert "runway/SKILL.md" in archive.namelist()
        assert info["skill"]["sha256"] == _release()["sha256"]


class TestNotAnMcpTool:
    def test_the_skill_tag_is_not_on_the_allowlist(self):
        from app.main import mcp

        names = {tool.name for tool in mcp.tools}
        assert "skill_info_skill_get" not in names
        assert "skill_zip_skill_runway_zip_get" not in names
        assert not [name for name in names if name.startswith("skill_")]
