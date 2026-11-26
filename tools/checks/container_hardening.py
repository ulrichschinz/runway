"""The runtime images under the deploy hardening — the second half of the RULE-TEST-002 tier.

Run by tools/checks/py-test-container.sh after the backend suite, on an x86_64 host with Docker
(the same platform limit, RISK-TEST-001). It builds backend/Dockerfile and frontend/Dockerfile
exactly as deploy.yml does and runs them with the flags ops/deploy/docker-compose.yml gives
them, against synthetic data in a temporary directory. Nothing here reads the deploy host,
users.db or data/ of this checkout, and nothing leaves the machine: the containers sit on a
private network and only the frontend publishes a port, on 127.0.0.1.

What it proves, in order (finding SEC-003 and SEC-004, brief 0076, ADR 0048):

0. The previous deploy's compose — no `user:`, a writable root, Docker's default capabilities,
   ./users.db at /app/users.db: the new backend image still registers a user and stores a task.
   The host keeps that file whenever its deploy script does not extract the new one
   (RISK-OPS-002), so the image's own default user has to work there (SHIM-OPS-001).
1. Legacy mode — uid 0 with the transitional capability set (SHIM-OPS-001), read-only root:
   the backend starts on root-owned volumes, a user registers, the real Taskwarrior stores a
   task, and even root cannot write the image.
2. Before migration, uid 10001 cannot write the root-owned volumes. The user is really
   unprivileged; the migration is what makes the switch work, not a permission it already had.
3. The migration tool inside the image refuses a planted symlink, plans changes in a dry-run
   without making them, applies them, and leaves a clean dry-run behind.
4. Switched mode — uid 10001, `cap_drop ALL`: healthy; no effective capability; every write
   outside /app/data, /app/db and /tmp refused; the task from step 1 is still there and a new
   one is stored; the files Taskwarrior writes belong to 10001.
5. Rolling the switch back to uid 0 on migrated data still works — and an account registered
   meanwhile is root's, so switching to uid 10001 again needs the migration again: the dry-run
   plans that change, the apply converges, and both accounts work as uid 10001 afterwards.
6. Frontend under the previous deploy's compose (no `user:`, writable root, default capabilities)
   and under this deploy's expand block (SHIM-OPS-002: the same plus the /tmp tmpfs and
   no-new-privileges): the new image is healthy, runs as its own uid 10002, and sends the headers.
   That is the forward half of the frontend's rollback trade; the backward half — the previous
   image under the expand block — needs that image and is not built here.
7. Frontend under the switch change's flags — uid 10002, `cap_drop ALL`, read-only root: healthy,
   cannot write its own content, and every response carries the browser headers: 200 at /, the
   SPA fallback, an asset and the favicon, 405 from nginx, the proxied API's 200 and 404, and 502
   with the backend absent. None carries HSTS.

It does NOT prove what the public origin sends — Traefik sits in front of this nginx — which is
the post-deploy check in deploy.yml. And non-root is not tenant isolation; that is the
cross-tenant suite in tests/container.
"""

from __future__ import annotations

import http.client
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_IMAGE = "runway-backend-hardening"
FRONTEND_IMAGE = "runway-frontend-hardening"

TMPFS = "/tmp:rw,noexec,nosuid,nodev,size=64m"
COMMON = ["--read-only", "--tmpfs", TMPFS, "--security-opt", "no-new-privileges:true"]
# The deploy compose's transitional backend set: every default capability but DAC_OVERRIDE.
TRANSITIONAL_DROPS = [
    "AUDIT_WRITE",
    "CHOWN",
    "FOWNER",
    "FSETID",
    "KILL",
    "MKNOD",
    "NET_BIND_SERVICE",
    "NET_RAW",
    "SETFCAP",
    "SETGID",
    "SETPCAP",
    "SETUID",
    "SYS_CHROOT",
]
LEGACY = ["--user", "0:0", *[a for c in TRANSITIONAL_DROPS for a in ("--cap-drop", c)]]
# The deploy compose before brief 0076: no user (the image decides), no hardening at all.
PREVIOUS_COMPOSE: list[str] = []
SWITCHED = ["--user", "10001:10001", "--cap-drop", "ALL"]

FRONTEND_TMPFS = "/tmp:rw,noexec,nosuid,nodev,size=16m"
# The frontend block before brief 0076: nothing but the image's own defaults.
FRONTEND_PREVIOUS: list[str] = []
# This deploy's frontend block while SHIM-OPS-002 stands.
FRONTEND_EXPAND = ["--tmpfs", FRONTEND_TMPFS, "--security-opt", "no-new-privileges:true"]
# The frontend switch change's block.
FRONTEND_SWITCHED = [
    "--read-only",
    *FRONTEND_EXPAND,
    "--user",
    "10002:10002",
    "--cap-drop",
    "ALL",
]

EXPECTED_HEADERS = {
    "content-security-policy": "frame-ancestors 'none'",
    "content-security-policy-report-only": "default-src 'self'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=()",
}

# Runs inside the backend container: one synthetic account, one task per call.
CLIENT = r"""
import json, sys, urllib.request, urllib.error
base = "http://127.0.0.1:8000"
def call(method, path, body=None, token=None):
    req = urllib.request.Request(base + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json",
                 **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
username = sys.argv[3] if len(sys.argv) > 3 else "hardening-probe"
creds = {"username": username, "password": "a synthetic password, not a secret"}
if sys.argv[1] == "register":
    status, body = call("POST", "/auth/register", creds)
    assert status == 201, (status, body)
status, body = call("POST", "/auth/login", creds)
assert status == 200, (status, body)
token = body["access_token"]
status, body = call("POST", "/tasks", {"description": sys.argv[2]}, token)
assert status == 201, (status, body)
status, body = call("GET", "/tasks", None, token)
assert status == 200, (status, body)
print(json.dumps(sorted(t["description"] for t in body)))
"""

WRITE_PROBE = r"""
import sys
results = {}
for path in sys.argv[1:]:
    try:
        with open(path, "a") as f:
            f.write("")
        results[path] = "writable"
    except OSError as e:
        results[path] = type(e).__name__
print(__import__("json").dumps(results))
"""

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)
        print(f"        FAILED: {message}", file=sys.stderr)


def docker(*args: str, check_rc: bool = True, timeout: int = 600) -> subprocess.CompletedProcess:
    # A fixed argv and no shell: nothing here is interpolated into a command line.
    result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=timeout)
    if check_rc and result.returncode != 0:
        raise RuntimeError(f"docker {' '.join(args[:3])} failed: {result.stderr.strip()[-800:]}")
    return result


class Scenario:
    def __init__(self) -> None:
        self.tag = secrets.token_hex(4)
        self.network = f"runway-hardening-{self.tag}"
        self.containers: list[str] = []
        self.tmp = Path(tempfile.mkdtemp(prefix="runway-hardening-"))
        self.secret = secrets.token_urlsafe(48)

    # --- plumbing ---------------------------------------------------------------------------

    def previous_mounts(self) -> list[str]:
        """The previous deploy compose's mounts: the database file directly at /app."""
        return [
            "-v",
            f"{self.tmp / 'data'}:/app/data",
            "-v",
            f"{self.tmp / 'users.db'}:/app/users.db",
        ]

    def mounts(self) -> list[str]:
        return [
            "-v",
            f"{self.tmp / 'data'}:/app/data",
            "-v",
            f"{self.tmp / 'db'}:/app/db",
            "-v",
            f"{self.tmp / 'users.db'}:/app/db/users.db",
        ]

    def as_root(self, script: str) -> None:
        """A fixture step on the synthetic volumes, as root in a throwaway container."""
        docker(
            "run",
            "--rm",
            "--network",
            "none",
            "--user",
            "0:0",
            "-v",
            f"{self.tmp}:/x",
            BACKEND_IMAGE,
            "sh",
            "-c",
            script,
        )

    def backend(self, name: str, privileges: list[str], previous: bool = False) -> str:
        cname = f"{name}-{self.tag}"
        docker(
            "run",
            "-d",
            "--name",
            cname,
            "--network",
            self.network,
            *([] if previous else COMMON),
            *privileges,
            *(self.previous_mounts() if previous else self.mounts()),
            "-e",
            f"JWT_SECRET={self.secret}",
            "-e",
            "DATA_ROOT=/app/data",
            "-e",
            f"DB_PATH={'/app/users.db' if previous else '/app/db/users.db'}",
            "-e",
            "ALLOW_REGISTRATION=true",
            "-e",
            "TZ=UTC",
            BACKEND_IMAGE,
        )
        self.containers.append(cname)
        return cname

    def wait_healthy(self, cname: str, probe: list[str], seconds: int = 90) -> bool:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if docker("exec", cname, *probe, check_rc=False).returncode == 0:
                return True
            state = docker("inspect", "-f", "{{.State.Running}}", cname, check_rc=False)
            if state.stdout.strip() == "false":
                break
            time.sleep(2)
        logs = docker("logs", "--tail", "30", cname, check_rc=False)
        print(f"        {cname} logs:\n{logs.stdout}{logs.stderr}", file=sys.stderr)
        return False

    def backend_healthy(self, cname: str) -> bool:
        probe = [
            "python",
            "-c",
            "import urllib.request; urllib.request.urlopen("
            "'http://127.0.0.1:8000/health', timeout=3)",
        ]
        return self.wait_healthy(cname, probe)

    def stop(self, cname: str) -> None:
        docker("rm", "-f", cname, check_rc=False)
        self.containers.remove(cname)

    def client(
        self, cname: str, mode: str, description: str, username: str = "hardening-probe"
    ) -> list[str]:
        out = docker(
            "exec", cname, "python", "-c", CLIENT, mode, description, username, check_rc=False
        )
        check(out.returncode == 0, f"{cname}: the API round trip failed: {out.stderr[-600:]}")
        return json.loads(out.stdout) if out.returncode == 0 else []

    def writes(self, cname: str, *paths: str) -> dict[str, str]:
        out = docker("exec", cname, "python", "-c", WRITE_PROBE, *paths)
        return json.loads(out.stdout)

    def migrate(self, *args: str) -> subprocess.CompletedProcess:
        return docker(
            "run",
            "--rm",
            "--network",
            "none",
            *COMMON,
            "--user",
            "0:0",
            "--cap-drop",
            "ALL",
            "--cap-add",
            "CHOWN",
            "--cap-add",
            "FOWNER",
            "--cap-add",
            "DAC_READ_SEARCH",
            *self.mounts(),
            BACKEND_IMAGE,
            "python",
            "/opt/runway/volume_ownership.py",
            "--json",
            *args,
            check_rc=False,
        )

    def cleanup(self) -> None:
        for cname in list(self.containers):
            docker("rm", "-f", cname, check_rc=False)
        docker("network", "rm", self.network, check_rc=False)
        # The volumes now belong to uid 10001 and 0700; only root inside a container may empty
        # them, after which the runner owns an empty directory again.
        docker(
            "run",
            "--rm",
            "--network",
            "none",
            "--user",
            "0:0",
            "-v",
            f"{self.tmp}:/x",
            BACKEND_IMAGE,
            "sh",
            "-c",
            "rm -rf /x/data /x/db /x/users.db",
            check_rc=False,
        )
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- the scenario -----------------------------------------------------------------------

    def run(self) -> None:
        docker("network", "create", self.network)
        (self.tmp / "data").mkdir()
        (self.tmp / "db").mkdir()
        (self.tmp / "users.db").touch()
        # The host as a root container left it: everything root's, world-readable.
        self.as_root(
            "chown -R 0:0 /x/data /x/db /x/users.db && chmod 755 /x/data /x/db "
            "&& chmod 644 /x/users.db"
        )

        print("  0. the previous deploy's compose: no user, writable root, default capabilities")
        be = self.backend("previous", PREVIOUS_COMPOSE, previous=True)
        check(self.backend_healthy(be), "the new image did not start under the previous compose")
        tasks = self.client(be, "register", "stored under the previous compose")
        check(
            tasks == ["stored under the previous compose"],
            f"the new image could not write under the previous compose: {tasks}",
        )
        self.stop(be)

        print("  1. legacy mode: uid 0, transitional capabilities, read-only root")
        be = self.backend("legacy", LEGACY)
        check(self.backend_healthy(be), "the backend did not become healthy as uid 0")
        check(docker("exec", be, "id", "-u").stdout.strip() == "0", "legacy mode is not uid 0")
        tasks = self.client(be, "login", "stored as uid 0")
        check(
            tasks == ["stored as uid 0", "stored under the previous compose"],
            f"legacy mode stored {tasks}",
        )
        probe = self.writes(be, "/app/probe", "/etc/probe")
        check(all(v != "writable" for v in probe.values()), f"uid 0 could write the image: {probe}")
        self.stop(be)

        print("  2. before migration, uid 10001 cannot write the volumes")
        before = docker(
            "run",
            "--rm",
            "--network",
            "none",
            *COMMON,
            *SWITCHED,
            *self.mounts(),
            BACKEND_IMAGE,
            "python",
            "-c",
            WRITE_PROBE,
            "/app/data/probe",
            "/app/db/probe",
            "/app/db/users.db",
        )
        unprivileged = json.loads(before.stdout)
        check(
            all(v != "writable" for v in unprivileged.values()),
            f"uid 10001 could write root-owned data before migration: {unprivileged}",
        )

        print("  3. the migration: refuses a symlink, dry-run, apply, clean")
        # Into whichever account directory exists, not a named one: the directory is the username
        # on today's layout and a random storage id once SEC-001 lands (brief 0065), and the
        # symlink must sit where an account's own files do either way.
        self.as_root(
            'd=$(find /x/data -mindepth 1 -maxdepth 1 -type d | head -n 1); '
            '[ -n "$d" ] && ln -s /etc/passwd "$d/evil"'
        )
        refused = self.migrate("--apply")
        check(
            refused.returncode == 2,
            f"a planted symlink did not refuse --apply ({refused.returncode})",
        )
        self.as_root("find /x/data -mindepth 2 -maxdepth 2 -name evil -type l -delete")
        dry = self.migrate()
        plan = json.loads(dry.stdout or "{}")
        check(
            dry.returncode == 1 and plan.get("changes"),
            f"the dry-run planned nothing: {dry.stdout[-400:]}",
        )
        check(not plan.get("anomalies"), f"the dry-run found anomalies: {plan.get('anomalies')}")
        still_root = docker(
            "run",
            "--rm",
            "--network",
            "none",
            "--user",
            "0:0",
            "-v",
            f"{self.tmp}:/x",
            BACKEND_IMAGE,
            "stat",
            "-c",
            "%u",
            "/x/data",
            "/x/users.db",
        ).stdout.split()
        check(still_root == ["0", "0"], f"the dry-run changed ownership: {still_root}")
        applied = self.migrate("--apply")
        check(applied.returncode == 0, f"--apply did not converge: {applied.stdout[-600:]}")
        clean = self.migrate()
        check(clean.returncode == 0, f"the dry-run after apply is not clean: {clean.stdout[-600:]}")

        print("  4. switched mode: uid 10001, cap_drop ALL")
        be = self.backend("switched", SWITCHED)
        check(self.backend_healthy(be), "the backend did not become healthy as uid 10001")
        ids = docker("exec", be, "sh", "-c", "id -u; id -g").stdout.split()
        check(ids == ["10001", "10001"], f"switched mode runs as {ids}")
        caps = docker("exec", be, "grep", "CapEff", "/proc/self/status").stdout.split()
        check(caps[-1:] == ["0000000000000000"], f"uid 10001 holds capabilities: {caps}")
        probe = self.writes(
            be,
            "/app/probe",
            "/app/app/main.py",
            "/app/BUILD_COMMIT",
            "/etc/probe",
            "/usr/local/bin/task",
            "/opt/runway/volume_ownership.py",
        )
        check(all(v != "writable" for v in probe.values()), f"uid 10001 could write: {probe}")
        allowed = self.writes(be, "/app/data/probe", "/app/db/probe", "/tmp/probe")
        check(all(v == "writable" for v in allowed.values()), f"a writable place is not: {allowed}")
        docker("exec", be, "rm", "-f", "/app/data/probe", "/app/db/probe", "/tmp/probe")
        tasks = self.client(be, "login", "stored as uid 10001")
        check(len(tasks) == 3 and "stored as uid 10001" in tasks, f"switched mode reads {tasks}")
        owners = docker(
            "exec", be, "sh", "-c", "find /app/data /app/db -xdev ! -user 10001 -print"
        ).stdout.strip()
        check(owners == "", f"files not owned by 10001 after switched-mode writes: {owners}")
        self.stop(be)

        print("  5. rolling the switch back: uid 0 on migrated data, and switching again")
        rollback = self.backend("rollback", LEGACY)
        check(self.backend_healthy(rollback), "uid 0 could not start on migrated data")
        tasks = self.client(rollback, "login", "stored after rollback")
        check(len(tasks) == 4, f"rollback reads {tasks}")
        late = self.client(rollback, "register", "registered as uid 0", "hardening-late")
        check(late == ["registered as uid 0"], f"registering as uid 0 stored {late}")
        self.stop(rollback)
        pending = self.migrate()
        check(
            pending.returncode == 1,
            f"the dry-run did not plan the uid-0 account's ownership ({pending.returncode}): "
            f"{pending.stdout[-400:]}",
        )
        again = self.migrate("--apply")
        check(again.returncode == 0, f"the second --apply did not converge: {again.stdout[-600:]}")
        be = self.backend("switched-again", SWITCHED)
        check(self.backend_healthy(be), "uid 10001 did not start after the second migration")
        late = self.client(be, "login", "stored as uid 10001 again", "hardening-late")
        check(len(late) == 2, f"the uid-0 account reads {late} as uid 10001")
        tasks = self.client(be, "login", "stored after switching again")
        check(len(tasks) == 5, f"the first account reads {tasks} after switching again")
        backend_for_frontend = be

        print("  6. frontend under the previous compose and under the expand block (SHIM-OPS-002)")
        probe = ["wget", "--spider", "-q", "http://127.0.0.1:4000/"]
        for label, flags in (("previous", FRONTEND_PREVIOUS), ("expand", FRONTEND_EXPAND)):
            fe, fe_port = self.frontend(f"frontend-{label}", backend_for_frontend, flags)
            check(
                self.wait_healthy(fe, probe, 60),
                f"the new frontend image did not start under the {label} compose block",
            )
            ids = docker("exec", fe, "sh", "-c", "id -u; id -g").stdout.split()
            check(ids == ["10002", "10002"], f"the frontend runs as {ids} under the {label} block")
            self.assert_headers(fe_port, "GET", "/", 200)
            self.assert_headers(fe_port, "GET", "/api/health", 200)
            self.stop(fe)

        print("  7. frontend: uid 10002, cap_drop ALL, read-only root, headers on every path")
        self.frontend_checks(backend_for_frontend)

    def frontend(
        self, name: str, backend_host: str, flags: list[str] | None = None
    ) -> tuple[str, int]:
        cname = f"{name}-{self.tag}"
        docker(
            "run",
            "-d",
            "--name",
            cname,
            "--network",
            self.network,
            *(FRONTEND_SWITCHED if flags is None else flags),
            "-e",
            f"BACKEND_HOST={backend_host}",
            "-p",
            "127.0.0.1::4000",
            FRONTEND_IMAGE,
        )
        self.containers.append(cname)
        port = docker("port", cname, "4000/tcp").stdout.strip().splitlines()[0].rsplit(":", 1)[1]
        return cname, int(port)

    def frontend_checks(self, backend: str) -> None:
        # Both frontends share the scenario's network with the backend, which nginx resolves by
        # container name once, at start. Only the frontends publish a port, on 127.0.0.1.
        live, port = self.frontend("frontend", backend)
        probe = ["wget", "--spider", "-q", "http://127.0.0.1:4000/"]
        check(self.wait_healthy(live, probe, 60), "the frontend did not become healthy")
        ids = docker("exec", live, "sh", "-c", "id -u; id -g").stdout.split()
        check(ids == ["10002", "10002"], f"the frontend runs as {ids}")
        for path in ("/usr/share/nginx/html/index.html", "/etc/nginx/nginx.conf", "/probe"):
            out = docker("exec", live, "sh", "-c", f"echo x >> {path}", check_rc=False)
            check(out.returncode != 0, f"the frontend could write {path}")

        index = fetch(port, "GET", "/")
        asset = re.search(r'src="(/assets/[^"]+\.js)"', index[2])
        cases = [
            ("GET", "/", 200),
            ("GET", "/next", 200),
            ("GET", asset.group(1) if asset else "/assets/missing.js", 200),
            ("GET", "/favicon.svg", 200),
            ("POST", "/index.html", 405),
            ("GET", "/api/health", 200),
            ("GET", "/api/hardening-probe-route-that-does-not-exist", 404),
        ]
        check(asset is not None, "index.html names no /assets/*.js entry")
        dead, dead_port = self.frontend("frontend-dead", "127.0.0.1")
        check(self.wait_healthy(dead, probe, 60), "the second frontend did not become healthy")
        for method, path, want in cases:
            self.assert_headers(port, method, path, want)
        self.assert_headers(dead_port, "GET", "/api/health", 502)

    def assert_headers(self, port: int, method: str, path: str, want: int) -> None:
        status, headers, _ = fetch(port, method, path)
        check(status == want, f"{method} {path} answered {status}, expected {want}")
        for name, fragment in EXPECTED_HEADERS.items():
            values = headers.get(name, [])
            check(len(values) == 1, f"{method} {path} ({status}) carries {len(values)} {name}")
            check(
                any(fragment in v for v in values),
                f"{method} {path} ({status}) {name} lacks {fragment!r}: {values}",
            )
        check(
            "strict-transport-security" not in headers,
            f"{method} {path} sends HSTS from the inner HTTP server",
        )


def fetch(port: int, method: str, path: str) -> tuple[int, dict[str, list[str]], str]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        conn.request(method, path, body=b"" if method == "POST" else None)
        response = conn.getresponse()
        body = response.read().decode("utf-8", "replace")
        headers: dict[str, list[str]] = {}
        for name, value in response.getheaders():
            headers.setdefault(name.lower(), []).append(value)
        return response.status, headers, body
    finally:
        conn.close()


def main() -> int:
    print("  building the runtime images as deploy.yml does")
    docker("build", "-q", "-t", BACKEND_IMAGE, "-f", "backend/Dockerfile", str(ROOT))
    docker("build", "-q", "-t", FRONTEND_IMAGE, str(ROOT / "frontend"))
    scenario = Scenario()
    try:
        scenario.run()
    except (
        RuntimeError,
        subprocess.TimeoutExpired,
        OSError,
        ValueError,
        IndexError,
        KeyError,
        AttributeError,
    ) as error:
        failures.append(f"the scenario could not run: {error}")
        print(f"        {error}", file=sys.stderr)
    finally:
        scenario.cleanup()
    if failures:
        print(f"{len(failures)} hardening check(s) failed", file=sys.stderr)
        return 1
    print("  runtime images: non-root, read-only, migrated, headers on every path")
    return 0


if __name__ == "__main__":
    os.chdir(ROOT)
    sys.exit(main())
