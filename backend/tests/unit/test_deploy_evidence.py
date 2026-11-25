"""RISK-OPS-002 (plan M8, brief 0073, ADR 0047 Decision 4): after a deploy, CI can tell which image is
running, under which compose file, at which schema version — without host access and without the server
handing out a file, a host path or a secret.

Two halves. The server: `GET /skill` reports the build id, the SHA-256 of the compose file baked into
the image and of the one the host applied (bind-mounted read-only), and the schema version. The job:
the `verify-deploy` and registry steps of `.github/workflows/deploy.yml`, extracted and run here against
stub `curl`/`docker` binaries — the way the step's own comment says it is driven by hand — must fail
for every way a deploy can claim success and not be the deploy this run made.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import subprocess
import zipfile
from pathlib import Path

import pytest
import yaml

from app.services import skill_service

REPO = Path(__file__).resolve().parents[3]
WORKFLOW = REPO / ".github" / "workflows" / "deploy.yml"
COMPOSE = REPO / "ops" / "deploy" / "docker-compose.yml"
SCHEMA = REPO / "ops" / "surfaces" / "db-schema.sql"


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --- the server's half ----------------------------------------------------------------------


@pytest.fixture
def image_layout(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Path]:
    build_id = tmp_path / "BUILD_ID"
    baked = tmp_path / "opt-stack-docker-compose.yml"
    applied = tmp_path / "etc-runway-applied-compose.yml"
    build_id.write_text("4242\n")
    baked.write_bytes(COMPOSE.read_bytes())
    applied.write_bytes(COMPOSE.read_bytes())
    monkeypatch.setattr(skill_service, "_build_id_file", lambda: build_id)
    monkeypatch.setattr(skill_service, "BAKED_COMPOSE", baked)
    monkeypatch.setattr(skill_service, "APPLIED_COMPOSE", applied)
    monkeypatch.setattr(skill_service, "_schema_version", 1)
    return {"build_id": build_id, "baked": baked, "applied": applied}


class TestTheServerReportsItsDeployment:
    def test_every_field_is_reported(self, image_layout):
        server = skill_service.skill_info().server
        assert server.build == "4242"
        assert server.compose_sha256 == _sha(COMPOSE)
        assert server.applied_compose_sha256 == _sha(COMPOSE)
        assert server.schema_version == 1

    def test_a_host_compose_that_differs_is_reported_as_it_is(self, image_layout):
        image_layout["applied"].write_text("services: {}\n")
        server = skill_service.skill_info().server
        assert server.applied_compose_sha256 == hashlib.sha256(b"services: {}\n").hexdigest()
        assert server.applied_compose_sha256 != server.compose_sha256

    def test_absent_files_are_null_and_dev(self, image_layout):
        for path in image_layout.values():
            path.unlink()
        server = skill_service.skill_info().server
        assert server.build == "dev"
        assert server.compose_sha256 is None
        assert server.applied_compose_sha256 is None

    def test_the_route_serves_hashes_never_the_file(self, client, image_layout):
        body = client.get("/skill").json()
        assert body["server"]["schema_version"] == 1  # recorded by the lifespan's init_db
        assert body["server"]["applied_compose_sha256"] == _sha(COMPOSE)
        text = json.dumps(body)
        assert "services:" not in text and "JWT_SECRET" not in text
        assert "/etc/runway" not in text and "/opt/stack" not in text

    def test_the_compose_mounts_itself_read_only_where_the_server_reads_it(self):
        backend = yaml.safe_load(COMPOSE.read_text())["services"]["backend"]
        assert f"./docker-compose.yml:{skill_service.APPLIED_COMPOSE}:ro" in backend["volumes"]

    def test_the_image_bakes_the_build_id(self):
        dockerfile = (REPO / "backend" / "Dockerfile").read_text()
        assert "ARG RUNWAY_BUILD" in dockerfile
        assert "> /app/BUILD_ID" in dockerfile
        steps = yaml.safe_load(WORKFLOW.read_text())["jobs"]["build-and-push"]["steps"]
        backend = next(s for s in steps if s.get("name") == "Build and push backend")
        assert "RUNWAY_BUILD=${{ github.run_id }}" in backend["with"]["build-args"]


# --- the job's half -------------------------------------------------------------------------


def _step(job: str, name: str) -> str:
    steps = yaml.safe_load(WORKFLOW.read_text())["jobs"][job]["steps"]
    return next(s for s in steps if s.get("name") == name)["run"]


SHA = "0123456789abcdef0123456789abcdef01234567"
RUN_ID = "987654"
DIGEST = "sha256:" + "d" * 64


def _schema_version() -> int:
    for line in SCHEMA.read_text().splitlines():
        if line.startswith("-- schema_version "):
            return int(line.split()[-1])
    raise AssertionError("ops/surfaces/db-schema.sql records no schema_version")


def _skill_body(**server_overrides) -> dict:
    release = json.loads((REPO / "ops" / "skill-release.json").read_text())
    plugin = json.loads(
        (REPO / "integrations" / "claude" / ".claude-plugin" / "plugin.json").read_text()
    )
    server = {
        "commit": SHA,
        "build": RUN_ID,
        "compose_sha256": _sha(COMPOSE),
        "applied_compose_sha256": _sha(COMPOSE),
        "schema_version": _schema_version(),
    }
    server.update(server_overrides)
    return {
        "skill": {"name": "runway", "version": plugin["version"], "sha256": release["sha256"]},
        "server": server,
        "download": "/api/skill/runway.zip",
    }


def _bin(directory: Path, name: str, script: str) -> None:
    path = directory / name
    path.write_text("#!/bin/sh\n" + script)
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


def _sandbox(tmp_path: Path, body: dict, registry_digest: str = DIGEST) -> dict[str, str]:
    stubs = tmp_path / "bin"
    stubs.mkdir(parents=True)
    (tmp_path / "skill.json").write_text(json.dumps(body))
    (tmp_path / "health.json").write_text('{"status": "ok"}')
    with zipfile.ZipFile(tmp_path / "skill.zip", "w") as archive:
        archive.writestr("runway/SKILL.md", "x")
    _bin(
        stubs,
        "curl",
        f"""out=""
url=""
while [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift 2;; -m) shift 2;; -*) shift;; *) url=$1; shift;; esac; done
case "$url" in
  */api/skill) cat "{tmp_path}/skill.json";;
  */api/health) cat "{tmp_path}/health.json";;
  */api/skill/runway.zip) cp "{tmp_path}/skill.zip" "$out";;
  *) exit 22;;
esac
""",
    )
    _bin(stubs, "sleep", "exit 0\n")
    _bin(
        stubs,
        "docker",
        f"""# docker buildx imagetools inspect <ref> --format '{{{{json .Manifest}}}}'
printf '{{"digest": "{registry_digest}"}}\\n'
""",
    )
    if shutil.which("sha256sum") is None:  # macOS: the runner has coreutils, this host has shasum
        _bin(stubs, "sha256sum", 'exec shasum -a 256 "$@"\n')
    return {
        "PATH": f"{stubs}:{os.environ['PATH']}",
        "GITHUB_SHA": SHA,
        "GITHUB_RUN_ID": RUN_ID,
        "GITHUB_REPOSITORY": "owner/runway",
        "REGISTRY": "ghcr.io",
        "RUNWAY_URL": "https://runway.example",
        "BACKEND_DIGEST": DIGEST,
        "GITHUB_STEP_SUMMARY": str(tmp_path / "summary"),
        "HOME": str(tmp_path),
    }


def _run(job: str, step: str, env: dict[str, str]) -> subprocess.CompletedProcess:
    return subprocess.run(  # noqa: S603  # a fixed interpreter and a script read from this repository
        ["/bin/sh", "-c", _step(job, step)],
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


ANSWERS = ("verify-deploy", "The running server answers for this commit")
REGISTRY = ("verify-deploy", "The registry serves the digest this run pushed")


class TestTheJobFailsForEveryFalseSuccess:
    def test_a_deploy_that_is_this_run_passes(self, tmp_path):
        result = _run(*ANSWERS, _sandbox(tmp_path, _skill_body()))
        assert result.returncode == 0, result.stderr

    @pytest.mark.parametrize(
        ("override", "needle"),
        [
            ({"build": "111"}, "build"),
            ({"build": "dev"}, "build"),
            ({"compose_sha256": "0" * 64}, "baked compose"),
            ({"applied_compose_sha256": "0" * 64}, "applied compose"),
            ({"applied_compose_sha256": None}, "applied compose"),
            ({"schema_version": 0}, "schema_version"),
            ({"schema_version": None}, "schema_version"),
        ],
    )
    def test_a_deploy_that_is_not_this_run_fails(self, tmp_path, override, needle):
        result = _run(*ANSWERS, _sandbox(tmp_path, _skill_body(**override)))
        assert result.returncode == 1, (override, result.stdout, result.stderr)
        assert needle in result.stderr

    def test_the_registry_digest_must_be_the_one_pushed(self, tmp_path):
        assert _run(*REGISTRY, _sandbox(tmp_path, _skill_body())).returncode == 0
        result = _run(*REGISTRY, _sandbox(tmp_path / "other", _skill_body(), "sha256:" + "e" * 64))
        assert result.returncode == 1
        assert "digest" in result.stderr

    def test_the_job_receives_the_pushed_digest(self):
        workflow = yaml.safe_load(WORKFLOW.read_text())
        build = workflow["jobs"]["build-and-push"]
        assert build["outputs"]["backend_digest"] == "${{ steps.backend.outputs.digest }}"
        verify = workflow["jobs"]["verify-deploy"]
        assert "build-and-push" in verify["needs"]
        assert (
            verify["env"]["BACKEND_DIGEST"] == "${{ needs.build-and-push.outputs.backend_digest }}"
        )
        assert verify["permissions"]["packages"] == "read"
