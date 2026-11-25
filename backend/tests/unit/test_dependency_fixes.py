"""SEC-005 (brief 0072, plan M7.2): the installed dependencies are the ones the intent names, and the
multipart parser is past its advisories — tested against what is *installed*, not what a file says.

A lock that names a fixed version proves nothing about the process that runs (plan §6, "Ein
aktualisierter Lock beweist nicht, dass das Image ihn installiert"). This tier checks the venv the unit
tests import; `tests/container/test_installed_dependencies.py` checks the image's own closure.

The multipart parser is not reachable from any route today (the review's counter-evidence, kept here as
a test rather than a grep): a route that starts parsing `multipart/form-data` is a new attack surface and
needs its own size, file and parser regressions before it ships.
"""

from __future__ import annotations

import logging
import re
from importlib import metadata
from pathlib import Path
from typing import Annotated

import fastapi
import pytest
from fastapi.params import File, Form
from fastapi.routing import APIRoute

BACKEND = Path(__file__).resolve().parents[2]

# CVE-2024-53981 (GHSA-59g5-xgcq-4qw3): the maintainer advisory names 0.0.18 as the first fix.
MULTIPART_FIRST_FIX = (0, 0, 18)
# The highest first-fixed version among the advisories OSV listed for 0.0.12 on 2026-11-25
# (GHSA-v9pg-7xvm-68hf, CVE-2026-53540: negative Content-Length buffers the body). Brief 0072.
MULTIPART_LATEST_ADVISORY_FIX = (0, 0, 31)

_PIN = re.compile(r"^([A-Za-z0-9_.\-]+)(?:\[[^\]]*\])?==([^\s\\;]+)", re.MULTILINE)


def _version(text: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.findall(r"\d+", text)[:3])


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def pins(path: Path) -> dict[str, str]:
    """`name==version` lines of a requirements file or lock, names normalised (PEP 503)."""
    return {_norm(m.group(1)): m.group(2) for m in _PIN.finditer(path.read_text(encoding="utf-8"))}


class TestTheVenvIsTheIntent:
    def test_every_direct_pin_is_the_installed_version(self):
        """The unit tier imports this venv; if it is not the intent, nothing below is evidence."""
        wrong = {
            name: (version, metadata.version(name))
            for name, version in pins(BACKEND / "requirements.txt").items()
            if metadata.version(name) != version
        }
        assert not wrong, f"installed differs from requirements.txt (run make bootstrap): {wrong}"

    def test_the_runtime_lock_installs_what_the_intent_names(self):
        """RULE-DEP-005 holds this in the gate; restated here next to the runtime check."""
        intent, lock = pins(BACKEND / "requirements.txt"), pins(BACKEND / "requirements.lock")
        assert {name: lock.get(name) for name in intent} == intent


class TestPythonMultipartIsPastItsAdvisories:
    def test_the_installed_version_has_the_cve_2024_53981_fix(self):
        assert _version(metadata.version("python-multipart")) >= MULTIPART_FIRST_FIX

    def test_the_installed_version_has_every_listed_fix(self):
        assert _version(metadata.version("python-multipart")) >= MULTIPART_LATEST_ADVISORY_FIX

    @pytest.mark.parametrize("lock", ["requirements.lock", "requirements-dev.lock"])
    def test_both_locks_pin_a_fixed_version(self, lock):
        assert _version(pins(BACKEND / lock)["python-multipart"]) >= MULTIPART_LATEST_ADVISORY_FIX

    def test_the_cve_input_is_parsed_without_a_log_event_per_byte(self, caplog):
        """The advisory's own input: line breaks before the first and after the last boundary. The
        affected parser skipped them one byte at a time and logged each one — 100 000 log records for
        this body on 0.0.12 — which is the CPU cost the CVE describes. A fixed parser stays bounded."""
        # The red run on 0.0.12 imported `multipart.multipart`, the module's name before 0.0.13.
        from python_multipart.multipart import MultipartParser

        padding = b"\r\n" * 50_000
        body = (
            padding
            + b'--B\r\nContent-Disposition: form-data; name="a"\r\n\r\nx\r\n--B--\r\n'
            + padding
        )
        caplog.set_level(logging.DEBUG)
        parser = MultipartParser(b"B", {})
        parser.write(body)
        parser.finalize()
        assert len(caplog.records) < 100


class TestNoRouteParsesMultipart:
    """The counter-evidence of the review (SEC-005 is not reachable today), as a regression."""

    def test_no_route_declares_a_form_or_file_parameter(self):
        from app.main import app

        multipart_routes = [
            f"{sorted(route.methods)} {route.path}"
            for route in app.routes
            if isinstance(route, APIRoute)
            for param in route.dependant.body_params
            if isinstance(param.field_info, (Form, File))
        ]
        assert not multipart_routes, (
            "a route now parses multipart/form-data — it needs size, file and parser regressions "
            f"before it ships (plan M7.2, brief 0072): {multipart_routes}"
        )

    def test_a_multipart_body_reaches_no_multipart_parser(self, client, monkeypatch):
        """Behaviour, not declaration: a JSON route sent multipart/form-data must refuse it without
        running the parser the CVE is in."""
        import starlette.formparsers

        parsed: list[str] = []

        async def _record(self):  # pragma: no cover — reaching it is the failure
            parsed.append("multipart")
            raise AssertionError("the multipart parser ran")

        monkeypatch.setattr(starlette.formparsers.MultiPartParser, "parse", _record)
        response = client.post(
            "/auth/login",
            content=b'--B\r\nContent-Disposition: form-data; name="username"\r\n\r\nx\r\n--B--\r\n',
            headers={"Content-Type": "multipart/form-data; boundary=B"},
        )
        assert response.status_code == 422
        assert parsed == []

    def test_positive_control_a_form_route_does_reach_the_parser(self, monkeypatch):
        """Without this, the test above would pass just as well if the recorder sat on the wrong
        function: a throwaway app with a Form route must reach it."""
        import starlette.formparsers
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        parsed: list[str] = []
        original = starlette.formparsers.MultiPartParser.parse

        async def _record(self):
            parsed.append("multipart")
            return await original(self)

        monkeypatch.setattr(starlette.formparsers.MultiPartParser, "parse", _record)
        probe = FastAPI()

        @probe.post("/form")
        async def form_route(name: Annotated[str, fastapi.Form()]) -> dict[str, str]:
            return {"name": name}

        response = TestClient(probe).post(
            "/form",
            content=b'--B\r\nContent-Disposition: form-data; name="name"\r\n\r\nx\r\n--B--\r\n',
            headers={"Content-Type": "multipart/form-data; boundary=B"},
        )
        assert response.status_code == 200
        assert parsed == ["multipart"]


class TestTheRuntimeImageCheck:
    """`tools/installed_matches_lock.py`, which deploy.yml runs inside the pushed backend image against
    that image's own `/app/requirements.lock` before the deploy job may start (brief 0072, review round
    1). The test image installs `requirements-dev.lock`, so only this sees the closure that ships."""

    SCRIPT = BACKEND.parent / "tools" / "installed_matches_lock.py"

    def _run(self, lock: Path, *, pythonpath: Path | None = None):
        import os
        import subprocess
        import sys

        env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
        if pythonpath is not None:
            env["PYTHONPATH"] = str(pythonpath)
        # stdin, as deploy.yml feeds it to the image's interpreter
        return subprocess.run(  # noqa: S603  # this interpreter and a repository script
            [sys.executable, "-", str(lock)],
            input=self.SCRIPT.read_text(encoding="utf-8"),
            capture_output=True,
            text=True,
            env=env,
        )

    def _lock(self, tmp_path: Path, edit=lambda text: text) -> Path:
        """A lock of what this interpreter actually has installed, for every package the dev lock
        names. A bootstrapped venv installs the intent, not the lock, so its transitives may be newer
        than the lock's; the script's logic is tested against a lock that is true here by construction."""
        lines = []
        for name in pins(BACKEND / "requirements-dev.lock"):
            try:
                lines.append(f"{name}=={metadata.version(name)} \\\n    --hash=sha256:00\n")
            except metadata.PackageNotFoundError:
                continue
        path = tmp_path / "installed.lock"
        path.write_text(edit("".join(lines)), encoding="utf-8")
        return path

    def test_positive_control_a_lock_of_what_is_installed_passes(self, tmp_path):
        result = self._run(self._lock(tmp_path))
        assert result.returncode == 0, result.stderr
        assert result.stdout.startswith("ok")

    def test_a_package_at_another_version_fails(self, tmp_path):
        lock = self._lock(
            tmp_path, lambda t: re.sub(r"^pyjwt==\S+", "pyjwt==2.13.0", t, flags=re.M)
        )
        result = self._run(lock)
        assert result.returncode == 1 and "pyjwt" in result.stderr

    def test_a_lock_moved_back_to_a_vulnerable_multipart_fails(self, tmp_path):
        """The script also holds the floor on its own (a lock moved back to 0.0.12 and an image that
        installed it would agree with each other); here the version mismatch and the floor both say so."""
        installed = metadata.version("python-multipart")
        lock = self._lock(
            tmp_path,
            lambda t: re.sub(r"^python-multipart==\S+", "python-multipart==0.0.12", t, flags=re.M),
        )
        result = self._run(lock)
        assert result.returncode == 1 and "python-multipart" in result.stderr
        assert installed != "0.0.12"

    def test_an_importable_jose_fails(self, tmp_path):
        lock = self._lock(tmp_path)
        (tmp_path / "jose").mkdir()
        (tmp_path / "jose" / "__init__.py").write_text("", encoding="utf-8")
        result = self._run(lock, pythonpath=tmp_path)
        assert result.returncode == 1 and "jose" in result.stderr

    def test_an_unreadable_or_tiny_lock_fails(self, tmp_path):
        tiny = tmp_path / "tiny.lock"
        tiny.write_text("fastapi==0.141.1\n", encoding="utf-8")
        assert self._run(tiny).returncode == 1
        assert self._run(tmp_path / "missing.lock").returncode == 1
