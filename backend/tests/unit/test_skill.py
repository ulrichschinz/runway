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


def _plugin_tree(root: Path, version: str = "9.9.9") -> Path:
    """A minimal `integrations/claude`: the three parts the Dockerfile copies, and nothing else."""
    plugin = root / "integrations" / "claude"
    (plugin / "skills" / "runway").mkdir(parents=True)
    (plugin / "skills" / "runway" / "SKILL.md").write_text("# runway\n", encoding="utf-8")
    (plugin / "hooks").mkdir(parents=True)
    (plugin / "hooks" / "runway-summary.sh").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    (plugin / ".claude-plugin").mkdir(parents=True)
    (plugin / ".claude-plugin" / "plugin.json").write_text(
        json.dumps({"name": "runway", "version": version}), encoding="utf-8"
    )
    return plugin


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


class TestTheReleasedTree:
    """What a plugin update delivers is what the release hash covers: `skills/` and `hooks/`.

    A hook is a script that runs on a user's machine at the start of every session, and it
    reaches them through the same version bump the skill does — so a hook edit that leaves
    the version alone reaches nobody, which is the failure `RULE-SURF-004` exists to name.
    The zip is the other half of that decision and stays skill-only: it is for clients that
    have no plugin system, and a hook they cannot register is a file they cannot use.
    """

    @pytest.fixture
    def plugin(self, tmp_path):
        return _plugin_tree(tmp_path)

    def test_a_changed_hook_changes_the_release_hash(self, plugin):
        before = skill_service._content_hash(plugin)
        (plugin / "hooks" / "runway-summary.sh").write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
        assert skill_service._content_hash(plugin) != before

    def test_a_changed_skill_changes_it_too(self, plugin):
        before = skill_service._content_hash(plugin)
        (plugin / "skills" / "runway" / "SKILL.md").write_text("# other\n", encoding="utf-8")
        assert skill_service._content_hash(plugin) != before

    def test_the_two_directories_are_told_apart_inside_one_digest(self, tmp_path):
        """Paths are hashed relative to the plugin root, not to each directory.

        Hashing `runway-summary.sh` and `SKILL.md` by their bare names would make moving a
        file from one directory to the other invisible — the same bytes under the same name.
        """
        one = _plugin_tree(tmp_path / "one")
        other = _plugin_tree(tmp_path / "other")
        (other / "hooks" / "runway-summary.sh").write_text("# runway\n", encoding="utf-8")
        (other / "skills" / "runway" / "SKILL.md").write_text(
            "#!/bin/sh\nexit 0\n", encoding="utf-8"
        )
        assert skill_service._content_hash(one) != skill_service._content_hash(other)

    def test_the_zip_carries_the_skill_and_not_the_hooks(self, plugin, monkeypatch, cold_cache):
        monkeypatch.setattr(skill_service, "_root", lambda: plugin)
        with zipfile.ZipFile(io.BytesIO(skill_service.skill_zip())) as archive:
            assert archive.namelist() == ["runway/SKILL.md"]


class TestHalfBundled:
    """One part of the bundle arrived and another did not.

    `.dockerignore` admits the three on three lines and the Dockerfile copies them on three,
    so losing one part is likelier than losing all of them — and the two directories have
    nothing to trip over: `rglob` on a directory that is not there yields nothing instead of
    raising. Answering 200 with a hash taken over the files that did arrive would be worse
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

    @pytest.fixture
    def without_hooks(self, tmp_path):
        plugin = _plugin_tree(tmp_path)
        for path in sorted((plugin / "hooks").iterdir()):
            path.unlink()
        (plugin / "hooks").rmdir()
        return plugin

    def test_the_metadata_route_answers_503(self, client, monkeypatch, manifest_only):
        monkeypatch.setattr(skill_service, "_root", lambda: manifest_only)
        r = client.get("/skill")
        assert r.status_code == 503
        assert "skill" in r.json()["detail"].lower()

    def test_the_download_answers_503(self, client, monkeypatch, cold_cache, manifest_only):
        monkeypatch.setattr(skill_service, "_root", lambda: manifest_only)
        assert client.get("/skill/runway.zip").status_code == 503

    def test_an_image_without_the_hooks_answers_503_rather_than_a_wrong_hash(
        self, client, monkeypatch, without_hooks
    ):
        monkeypatch.setattr(skill_service, "_root", lambda: without_hooks)
        r = client.get("/skill")
        assert r.status_code == 503
        assert "hooks" in r.json()["detail"]


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
