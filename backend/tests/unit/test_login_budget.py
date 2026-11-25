"""REV-003 and RISK-SEC-003: the login budget is reserved before the work (brief 0069, plan M3.2).

The serial limiter (`test_security_wave.py::TestLoginIsRateLimited`) has existed since SEC-8. What
it never proved:

- that parallel requests cannot all pass the check before the first failure is counted — the
  old limiter checked before the asynchronous account lookup and counted after the KDF;
- that the store is bounded — the old one removed an expired entry only when the same name was
  tried again, so every new name was a new dict key until the process restarted;
- that a spray across many names, or from many places, is stopped at all.

The tests here hold real requests together through the ASGI app, flood it with fresh names, and
drive the limiter from threads. Every one of them is about the property, not the mechanism: a
test that only checked that `reserve` exists would pass on a limiter that reserved nothing.
"""

from __future__ import annotations

import asyncio
import re
import threading
from pathlib import Path

import httpx
import pytest

from app import audit, rate_limit
from app.config import settings

BASE = "http://login-budget-under-test"
WRONG = "definitely not the password"
# Long enough that unthrottled requests certainly all arrive (they need milliseconds); short
# enough that a run where only the budget's worth can arrive costs one second.
BARRIER_TIMEOUT = 1.0


def _audit_rows(event: str) -> list[dict]:
    import sqlite3

    from app import database

    con = sqlite3.connect(database.audit_db_path())
    con.row_factory = sqlite3.Row
    rows = [
        dict(r)
        for r in con.execute(
            "SELECT * FROM audit_events WHERE event = ? ORDER BY id", (event,)
        ).fetchall()
    ]
    con.close()
    return rows


def _refusals_in(detail: str) -> int:
    """Every throttled row states how many refused attempts it stands for."""
    match = re.search(r"refusals: (\d+)", detail or "")
    assert match, f"a throttled row without its count: {detail!r}"
    return int(match.group(1))


def _keys_held() -> int:
    """How many keys the limiter's store holds, across tiers."""
    return rate_limit.key_count()


class _Gate:
    """N parties; a party that waits alone gives up after `timeout` and goes on."""

    def __init__(self, parties: int, timeout: float) -> None:
        self.parties, self.timeout = parties, timeout
        self.arrived = 0
        self._all_here = asyncio.Event()

    async def wait(self) -> None:
        self.arrived += 1
        if self.arrived >= self.parties:
            self._all_here.set()
        try:
            await asyncio.wait_for(self._all_here.wait(), self.timeout)
        except TimeoutError:
            pass


async def _burst(app, bodies: list[dict], *, peer: str = "203.0.113.7", headers=None):
    transport = httpx.ASGITransport(app=app, client=(peer, 40000))
    async with httpx.AsyncClient(transport=transport, base_url=BASE, timeout=30) as http:
        return await asyncio.gather(
            *(http.post("/auth/login", json=b, headers=headers or {}) for b in bodies)
        )


def _post(app, body: dict, *, peer: str = "203.0.113.7", headers=None) -> httpx.Response:
    return asyncio.run(_burst(app, [body], peer=peer, headers=headers))[0]


@pytest.fixture
def kdf_calls(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Every call to the password check the login route makes, by username-less marker."""
    from app.routers import auth as auth_router

    calls: list[str] = []
    real = auth_router.check_password

    def counting(password, stored, *, phase):
        calls.append("kdf")
        return real(password, stored, phase=phase)

    monkeypatch.setattr(auth_router, "check_password", counting)
    return calls


# --- the acceptance criterion: a parallel burst ----------------------------------------------


class TestAParallelBurst:
    """Plan M3.2 acceptance: a synthetic burst of parallel requests does not exceed the account
    budget and starts no KDF work once the budget is exhausted."""

    BURST = 40

    @pytest.fixture
    def held_before_the_kdf(self, monkeypatch: pytest.MonkeyPatch) -> _Gate:
        """Hold every request that got past the limiter at the last await before its KDF, until
        all of the burst has arrived there or the timeout passes. Without a reservation taken
        before the lookup, all of them arrive; with one, only the budget's worth can."""
        from app.routers import auth as auth_router

        gate = _Gate(self.BURST, BARRIER_TIMEOUT)
        real_phase = auth_router._phase

        async def held_phase(db):
            await gate.wait()
            return await real_phase(db)

        monkeypatch.setattr(auth_router, "_phase", held_phase)
        return gate

    def test_the_account_budget_holds_under_a_burst(
        self, client, registered, kdf_calls, held_before_the_kdf
    ):
        from app.main import app

        body = {"username": registered["username"], "password": WRONG}
        responses = asyncio.run(_burst(app, [body] * self.BURST))
        statuses = sorted(r.status_code for r in responses)

        assert statuses.count(401) == settings.login_rate_limit, statuses
        assert statuses.count(429) == self.BURST - settings.login_rate_limit, statuses
        # The point of reserving first: a refused request never reaches the password check.
        assert len(kdf_calls) == settings.login_rate_limit
        assert held_before_the_kdf.arrived == settings.login_rate_limit

    def test_after_the_burst_the_correct_password_is_refused_too(
        self, client, registered, held_before_the_kdf
    ):
        from app.main import app

        body = {"username": registered["username"], "password": WRONG}
        asyncio.run(_burst(app, [body] * self.BURST))
        right = {"username": registered["username"], "password": registered["password"]}
        assert _post(app, right).status_code == 429


# --- the bounded store ------------------------------------------------------------------------


class TestTheStoreIsBounded:
    def test_expired_names_are_swept_without_being_tried_again(
        self, client, monkeypatch: pytest.MonkeyPatch
    ):
        """The old limiter removed an expired entry only when the same name came back."""
        for i in range(20):
            client.post("/auth/login", json={"username": f"sprayed-{i}", "password": WRONG})
        assert _keys_held() >= 20

        real_now = rate_limit._now()
        monkeypatch.setattr(
            rate_limit, "_now", lambda: real_now + settings.login_rate_window_seconds + 61
        )
        client.post("/auth/login", json={"username": "someone-new", "password": WRONG})
        # The twenty sprayed names are gone; what is left is the new name and its source.
        assert _keys_held() <= 3

    def test_a_flood_of_new_names_cannot_grow_the_store_past_its_cap(
        self, client, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(settings, "login_rate_max_keys", 25)
        monkeypatch.setattr(settings, "login_source_rate_limit", 10_000)
        monkeypatch.setattr(settings, "login_global_rate_limit", 10_000)
        statuses = [
            client.post(
                "/auth/login", json={"username": f"flood-{i}", "password": WRONG}
            ).status_code
            for i in range(60)
        ]
        assert rate_limit.key_count("account") <= 25
        assert statuses[:25] == [401] * 25
        # Refused, not evicted: a full store must not flush someone else's counter.
        assert set(statuses[25:]) == {429}

    def test_a_full_store_does_not_forget_the_victim(
        self, client, registered, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(settings, "login_rate_max_keys", 5)
        monkeypatch.setattr(settings, "login_source_rate_limit", 10_000)
        monkeypatch.setattr(settings, "login_global_rate_limit", 10_000)
        victim = registered["username"]
        for _ in range(settings.login_rate_limit):
            client.post("/auth/login", json={"username": victim, "password": WRONG})
        for i in range(50):
            client.post("/auth/login", json={"username": f"flush-{i}", "password": WRONG})
        right = {"username": victim, "password": registered["password"]}
        assert client.post("/auth/login", json=right).status_code == 429


# --- the tiers ---------------------------------------------------------------------------------


class TestTheTiers:
    def test_a_spray_from_one_source_is_stopped(self, client, kdf_calls):
        """Ten guesses per name, unlimited names, was an unthrottled password spray."""
        statuses = [
            client.post(
                "/auth/login", json={"username": f"user-{i}", "password": WRONG}
            ).status_code
            for i in range(settings.login_source_rate_limit + 5)
        ]
        assert statuses.count(401) == settings.login_source_rate_limit
        assert statuses[-5:] == [429] * 5
        assert len(kdf_calls) == settings.login_source_rate_limit

    def test_a_spray_from_many_sources_meets_the_global_budget(
        self, client, monkeypatch: pytest.MonkeyPatch, kdf_calls
    ):
        from app.main import app

        monkeypatch.setattr(settings, "login_global_rate_limit", 12)
        statuses = [
            _post(
                app, {"username": f"user-{i}", "password": WRONG}, peer=f"198.51.100.{i}"
            ).status_code
            for i in range(20)
        ]
        assert statuses.count(401) == 12
        assert set(statuses[12:]) == {429}
        assert len(kdf_calls) == 12

    def test_spelling_variants_share_one_account_budget(self, client, registered):
        name = registered["username"]  # "alice"
        variants = [name, name.upper(), name.capitalize(), "ａlice"]  # fullwidth a
        for i in range(settings.login_rate_limit):
            client.post("/auth/login", json={"username": variants[i % 4], "password": WRONG})
        right = {"username": name, "password": registered["password"]}
        assert client.post("/auth/login", json=right).status_code == 429

    def test_a_success_does_not_reset_the_source_tier(
        self, client, registered, monkeypatch: pytest.MonkeyPatch
    ):
        """An attacker with an account of their own must not be able to log in between guesses
        to refill the budget of the place they are guessing from."""
        monkeypatch.setattr(settings, "login_source_rate_limit", 6)
        right = {"username": registered["username"], "password": registered["password"]}
        for i in range(5):
            client.post("/auth/login", json={"username": f"guess-{i}", "password": WRONG})
            assert client.post("/auth/login", json=right).status_code == 200
        assert (
            client.post("/auth/login", json={"username": "guess-x", "password": WRONG}).status_code
            == 401
        )
        assert (
            client.post("/auth/login", json={"username": "guess-y", "password": WRONG}).status_code
            == 429
        )


# --- the source behind a proxy -----------------------------------------------------------------


class TestTheSourceBehindAProxy:
    def test_forwarded_for_from_an_untrusted_peer_is_ignored(
        self, client, monkeypatch: pytest.MonkeyPatch
    ):
        """Without a trusted proxy, a client that writes its own X-Forwarded-For must not get a
        fresh source budget per request."""
        from app.main import app

        monkeypatch.setattr(settings, "trusted_proxies", "")
        monkeypatch.setattr(settings, "login_source_rate_limit", 3)
        statuses = [
            _post(
                app,
                {"username": f"u{i}", "password": WRONG},
                peer="203.0.113.9",
                headers={"X-Forwarded-For": f"192.0.2.{i}"},
            ).status_code
            for i in range(5)
        ]
        assert statuses == [401, 401, 401, 429, 429]

    def test_behind_a_trusted_proxy_each_client_has_its_own_budget(
        self, client, monkeypatch: pytest.MonkeyPatch
    ):
        from app.main import app

        monkeypatch.setattr(settings, "trusted_proxies", "10.0.0.0/24")
        monkeypatch.setattr(settings, "login_source_rate_limit", 3)
        for i in range(3):
            _post(
                app,
                {"username": f"a{i}", "password": WRONG},
                peer="10.0.0.2",
                headers={"X-Forwarded-For": "192.0.2.1"},
            )
        blocked = _post(
            app,
            {"username": "a9", "password": WRONG},
            peer="10.0.0.2",
            headers={"X-Forwarded-For": "192.0.2.1"},
        )
        other = _post(
            app,
            {"username": "b0", "password": WRONG},
            peer="10.0.0.2",
            headers={"X-Forwarded-For": "192.0.2.2"},
        )
        assert (blocked.status_code, other.status_code) == (429, 401)

    def test_the_left_of_the_chain_cannot_be_spoofed(self, client, monkeypatch: pytest.MonkeyPatch):
        """Only the hop a trusted proxy appended is believed; what the client wrote in front of
        it is never read."""
        from app.main import app

        monkeypatch.setattr(settings, "trusted_proxies", "10.0.0.2")
        monkeypatch.setattr(settings, "login_source_rate_limit", 3)
        statuses = [
            _post(
                app,
                {"username": f"s{i}", "password": WRONG},
                peer="10.0.0.2",
                headers={"X-Forwarded-For": f"198.51.100.{i}, 192.0.2.50"},
            ).status_code
            for i in range(5)
        ]
        assert statuses == [401, 401, 401, 429, 429]


class TestSourceOf:
    """The pure rule. `source_of(peer, forwarded_for, trusted)`."""

    def nets(self, text: str):
        return rate_limit.trusted_networks(text)

    def test_no_trusted_proxy_means_the_peer(self):
        assert rate_limit.source_of("203.0.113.5", ["192.0.2.1"], self.nets("")) == "203.0.113.5"

    def test_a_trusted_peer_yields_the_rightmost_untrusted_hop(self):
        trusted = self.nets("10.0.0.0/8")
        got = rate_limit.source_of("10.0.0.2", ["198.51.100.1, 192.0.2.7, 10.0.0.9"], trusted)
        assert got == "192.0.2.7"

    def test_several_header_lines_are_one_chain(self):
        trusted = self.nets("10.0.0.0/8")
        got = rate_limit.source_of("10.0.0.2", ["198.51.100.1", "192.0.2.7"], trusted)
        assert got == "192.0.2.7"

    def test_only_trusted_hops_yield_the_leftmost(self):
        trusted = self.nets("10.0.0.0/8")
        assert rate_limit.source_of("10.0.0.2", ["10.0.0.3, 10.0.0.4"], trusted) == "10.0.0.3"

    def test_a_trusted_peer_without_a_header_is_the_peer(self):
        assert rate_limit.source_of("10.0.0.2", [], self.nets("10.0.0.2")) == "10.0.0.2"

    def test_garbage_where_an_address_should_be_is_one_shared_key(self):
        trusted = self.nets("10.0.0.2")
        a = rate_limit.source_of("10.0.0.2", ["<script>"], trusted)
        b = rate_limit.source_of("10.0.0.2", ["not-an-ip-either"], trusted)
        assert a == b == rate_limit.UNPARSEABLE_SOURCE

    def test_ipv6_is_grouped_by_slash_64(self):
        none = self.nets("")
        a = rate_limit.source_of("2001:db8:1:2::1", [], none)
        b = rate_limit.source_of("2001:db8:1:2:ffff::9", [], none)
        c = rate_limit.source_of("2001:db8:1:3::1", [], none)
        assert a == b != c

    def test_an_ipv4_mapped_address_is_the_ipv4_address(self):
        none = self.nets("")
        assert rate_limit.source_of("::ffff:192.0.2.1", [], none) == "192.0.2.1"

    def test_a_missing_peer_is_one_shared_key(self):
        assert rate_limit.source_of(None, [], self.nets("")) == rate_limit.UNKNOWN_SOURCE

    def test_the_whole_internet_is_never_trusted(self):
        assert self.nets("0.0.0.0/0, ::/0") == ()

    def test_a_malformed_entry_is_ignored_and_the_rest_kept(self):
        nets = self.nets("10.0.0.0/8, nonsense, 192.168.1.300, 172.16.0.1")
        assert [str(n) for n in nets] == ["10.0.0.0/8", "172.16.0.1/32"]


# --- the reservation itself --------------------------------------------------------------------


class TestTheReservation:
    def _reserve(self, name: str = "alice", source: str = "192.0.2.1"):
        decision = rate_limit.reserve(name, source)
        assert decision.reservation is not None, decision
        return decision.reservation

    def test_an_in_flight_attempt_counts_against_the_budget(self):
        held = [self._reserve() for _ in range(settings.login_rate_limit)]
        refused = rate_limit.reserve("alice", "192.0.2.1")
        assert refused.reservation is None and refused.tier == "account"
        for r in held:
            r.succeed()

    def test_a_success_releases_and_clears_the_account(self):
        for _ in range(settings.login_rate_limit - 1):
            self._reserve().fail()
        self._reserve().succeed()
        for _ in range(settings.login_rate_limit):
            self._reserve().fail()
        assert rate_limit.reserve("alice", "192.0.2.1").reservation is None

    def test_leaving_without_closing_counts_as_a_failure(self):
        """A cancelled request or an exception between reserve and close must not escape the
        budget, and must not leak its slot either."""
        for _ in range(settings.login_rate_limit):
            with pytest.raises(RuntimeError):
                with self._reserve():
                    raise RuntimeError("the database went away")
        refused = rate_limit.reserve("alice", "192.0.2.1")
        assert refused.reservation is None and refused.retry_after > 1

    def test_closing_twice_counts_once(self):
        r = self._reserve()
        r.fail()
        r.fail()
        r.succeed()
        for _ in range(settings.login_rate_limit - 1):
            self._reserve().fail()
        assert rate_limit.reserve("alice", "192.0.2.1").reservation is None

    def test_threads_never_get_more_slots_than_the_budget(self, monkeypatch: pytest.MonkeyPatch):
        """The lock is the atomicity: 64 threads released at once, one account."""
        start = threading.Barrier(64)
        granted: list[object] = []
        guard = threading.Lock()

        def attempt():
            start.wait()
            decision = rate_limit.reserve("alice", "192.0.2.1")
            if decision.reservation is not None:
                with guard:
                    granted.append(decision.reservation)

        threads = [threading.Thread(target=attempt) for _ in range(64)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert len(granted) == settings.login_rate_limit

    def test_retry_after_counts_down_from_the_oldest_failure(self, monkeypatch: pytest.MonkeyPatch):
        for _ in range(settings.login_rate_limit):
            self._reserve().fail()
        first = rate_limit.reserve("alice", "192.0.2.1").retry_after
        assert (
            settings.login_rate_window_seconds - 2
            <= first
            <= settings.login_rate_window_seconds + 1
        )
        real_now = rate_limit._now()
        monkeypatch.setattr(rate_limit, "_now", lambda: real_now + 100)
        later = rate_limit.reserve("alice", "192.0.2.1").retry_after
        assert later <= first - 99


# --- the audit trail is bounded and still counts ----------------------------------------------


class TestRefusalsAreReportedNotWrittenOneByOne:
    def test_a_hammered_account_writes_a_bounded_number_of_rows(
        self, client, registered, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(settings, "login_source_rate_limit", 10_000)
        name = registered["username"]
        for _ in range(settings.login_rate_limit + 200):
            client.post("/auth/login", json={"username": name, "password": WRONG})
        throttled = _audit_rows(audit.LOGIN_THROTTLED)
        assert 1 <= len(throttled) <= 2
        assert throttled[0]["actor"] == name and "retry in" in throttled[0]["detail"]
        # Failed attempts inside the budget are still one row each.
        assert len(_audit_rows(audit.LOGIN_FAILED)) == settings.login_rate_limit

    def test_the_count_of_refusals_is_not_lost(
        self, client, registered, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(settings, "login_source_rate_limit", 10_000)
        name = registered["username"]
        for _ in range(settings.login_rate_limit + 50):
            client.post("/auth/login", json={"username": name, "password": WRONG})
        # After the window the key is swept, and its count is written as a summary row.
        real_now = rate_limit._now()
        monkeypatch.setattr(
            rate_limit, "_now", lambda: real_now + settings.login_rate_window_seconds + 61
        )
        client.post("/auth/login", json={"username": "unrelated", "password": WRONG})
        rows = [r for r in _audit_rows(audit.LOGIN_THROTTLED) if r["actor"] == name]
        assert sum(_refusals_in(r["detail"]) for r in rows) == 50

    def test_a_source_refusal_row_carries_no_address(self, client, monkeypatch: pytest.MonkeyPatch):
        from app.main import app

        monkeypatch.setattr(settings, "login_source_rate_limit", 2)
        for i in range(5):
            _post(app, {"username": f"n{i}", "password": WRONG}, peer="203.0.113.77")
        rows = _audit_rows(audit.LOGIN_THROTTLED)
        assert rows, "a source refusal must still be recorded"
        for row in rows:
            assert "203.0.113.77" not in str(row)
            assert row["actor"] is None
            assert "source" in row["detail"]


# --- the single-worker assumption, executable -------------------------------------------------


REPO = Path(__file__).resolve().parents[3]


class TestTheSingleWorkerAssumption:
    """RISK-SEC-003's re-open trigger, as a test: the limiter's state is one process's memory, so
    a second worker multiplies every budget. If one of these fails, the trigger has fired —
    a shared limiter is required before the change can ship, not after (docs/security.md)."""

    def test_the_image_runs_one_worker_and_trusts_no_proxy_header_itself(self):
        dockerfile = (REPO / "backend" / "Dockerfile").read_text()
        cmd = dockerfile[dockerfile.index("CMD [") :]
        # Pinned to one, not merely absent: absent lets $WEB_CONCURRENCY decide (review R3).
        assert '"--workers", "1"' in cmd and cmd.count("--workers") == 1
        assert '"--no-proxy-headers"' in cmd

    @pytest.mark.parametrize("compose", ["ops/deploy/docker-compose.yml", "docker-compose.yml"])
    def test_no_compose_file_scales_the_backend(self, compose):
        text = (REPO / compose).read_text()
        for marker in ("WEB_CONCURRENCY", "replicas:", "scale:", "--workers"):
            assert marker not in text, f"{compose} sets {marker}: see RISK-SEC-003"

    def test_the_deploy_compose_passes_trusted_proxies_through(self):
        text = (REPO / "ops" / "deploy" / "docker-compose.yml").read_text()
        assert "- TRUSTED_PROXIES=${TRUSTED_PROXIES:-}" in text

    def test_nginx_appends_to_x_forwarded_for(self):
        nginx = (REPO / "frontend" / "nginx.conf").read_text()
        assert nginx.count("proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;") == 2


# --- review round (brief 0069, R1–R4) ---------------------------------------------------------


class TestThePasswordChangeIsBudgeted:
    """R1: `PUT /auth/password` verifies the current password with the full KDF and accepts an
    API key. Outside the budget, a stolen key was an unlimited password oracle — also while the
    account's login was locked."""

    def _change(self, client, registered, current: str):
        return client.put(
            "/auth/password",
            headers={"X-Api-Key": registered["api_key"]},
            json={"current_password": current, "new_password": "a brand new passphrase"},
        )

    def test_guesses_through_an_api_key_are_bounded(self, client, registered, kdf_calls):
        statuses = [self._change(client, registered, WRONG).status_code for _ in range(30)]
        assert statuses.count(400) == settings.login_rate_limit, statuses
        assert set(statuses[settings.login_rate_limit :]) == {429}
        assert len(kdf_calls) == settings.login_rate_limit
        failed = [r for r in _audit_rows(audit.PASSWORD_CHANGED) if r["outcome"] == audit.FAILURE]
        assert len(failed) == settings.login_rate_limit

    def test_a_locked_login_also_locks_the_password_check(self, client, registered, kdf_calls):
        for _ in range(settings.login_rate_limit):
            client.post("/auth/login", json={"username": registered["username"], "password": WRONG})
        before = len(kdf_calls)
        r = self._change(client, registered, registered["password"])
        assert r.status_code == 429 and "Retry-After" in r.headers
        assert len(kdf_calls) == before, "a refused password check must cost no KDF work"
        # And the password was not changed behind the lockout.
        rate_limit.reset_all()
        right = {"username": registered["username"], "password": registered["password"]}
        assert client.post("/auth/login", json=right).status_code == 200

    def test_the_right_current_password_still_changes_it(self, client, registered):
        for _ in range(3):
            self._change(client, registered, WRONG)
        r = self._change(client, registered, registered["password"])
        assert r.status_code == 200, r.text


class TestAnUndeclaredProxyIsNotOneSourceForEveryone:
    """R2: with TRUSTED_PROXIES empty, every login behind nginx arrives from nginx's address.
    Counting that address as one source made 30 wrong logins from anybody a lockout of every
    account."""

    NGINX = "172.18.0.7"

    def test_a_spray_through_the_proxy_does_not_lock_out_a_bystander(
        self, client, registered, monkeypatch: pytest.MonkeyPatch
    ):
        from app.main import app

        monkeypatch.setattr(settings, "trusted_proxies", "")
        for i in range(settings.login_source_rate_limit + 5):
            _post(app, {"username": f"x{i}", "password": WRONG}, peer=self.NGINX)
        right = {"username": registered["username"], "password": registered["password"]}
        assert _post(app, right, peer=self.NGINX).status_code == 200

    def test_the_global_brake_still_holds_through_the_proxy(
        self, client, monkeypatch: pytest.MonkeyPatch, kdf_calls
    ):
        from app.main import app

        monkeypatch.setattr(settings, "trusted_proxies", "")
        monkeypatch.setattr(settings, "login_global_rate_limit", 12)
        statuses = [
            _post(app, {"username": f"y{i}", "password": WRONG}, peer=self.NGINX).status_code
            for i in range(20)
        ]
        assert statuses.count(401) == 12 and set(statuses[12:]) == {429}
        assert len(kdf_calls) == 12

    def test_four_full_sources_do_not_trip_the_global_brake(
        self, client, registered, monkeypatch: pytest.MonkeyPatch
    ):
        """The global brake is sized from the KDF, not a few times the account budget: four
        addresses spending their whole source budget is not yet everyone's lockout."""
        from app.main import app

        for s in range(4):
            for i in range(settings.login_source_rate_limit):
                _post(app, {"username": f"z{s}-{i}", "password": WRONG}, peer=f"198.51.100.{s}")
        right = {"username": registered["username"], "password": registered["password"]}
        assert _post(app, right, peer="203.0.113.200").status_code == 200

    @pytest.mark.parametrize(
        "peer", ["127.0.0.1", "10.1.2.3", "172.18.0.7", "192.168.1.5", "::1", "fd00::5"]
    )
    def test_a_proxy_shaped_peer_without_trust_has_no_source_key(self, peer):
        assert rate_limit.source_of(peer, ["192.0.2.1"], ()) is None

    def test_a_public_peer_without_trust_is_still_counted(self):
        assert rate_limit.source_of("203.0.113.5", [], ()) == "203.0.113.5"

    def test_once_proxies_are_declared_a_private_peer_is_counted(self):
        trusted = rate_limit.trusted_networks("172.18.0.7")
        assert rate_limit.source_of("172.18.0.9", [], trusted) == "172.18.0.9"


class TestTheSingleWorkerPinIsWholeFile:
    """R3: uvicorn takes its worker count from WEB_CONCURRENCY too, and an ENTRYPOINT or a
    gunicorn wrapper would replace the CMD. The trigger reads the whole Dockerfile."""

    def test_the_cmd_pins_one_worker(self):
        dockerfile = (REPO / "backend" / "Dockerfile").read_text()
        cmd = dockerfile[dockerfile.index("CMD [") :]
        assert '"--workers", "1"' in cmd
        assert cmd.count("--workers") == 1

    def test_nothing_else_in_the_dockerfile_can_start_more_workers(self):
        lines = [
            line.strip()
            for line in (REPO / "backend" / "Dockerfile").read_text().splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
        text = "\n".join(lines)
        assert "WEB_CONCURRENCY" not in text
        assert "gunicorn" not in text
        assert not any(line.startswith("ENTRYPOINT") for line in lines)
        assert sum(line.startswith("CMD") for line in lines) == 1


LOGIN_VARS = {
    "LOGIN_RATE_LIMIT": "login_rate_limit",
    "LOGIN_RATE_WINDOW_SECONDS": "login_rate_window_seconds",
    "LOGIN_SOURCE_RATE_LIMIT": "login_source_rate_limit",
    "LOGIN_GLOBAL_RATE_LIMIT": "login_global_rate_limit",
    "LOGIN_RATE_MAX_KEYS": "login_rate_max_keys",
}


@pytest.mark.parametrize("compose", ["ops/deploy/docker-compose.yml", "docker-compose.yml"])
@pytest.mark.parametrize("var", sorted(LOGIN_VARS))
def test_every_login_budget_variable_reaches_the_container(compose, var):
    """R4: both compose files list `environment:` explicitly and have no env_file, so a variable
    not listed there does nothing when set in the host .env. Each line's default must be the
    Settings default: an empty value would not parse as an int and the backend would not boot."""
    from app.config import Settings

    text = (REPO / compose).read_text()
    default = Settings.model_fields[LOGIN_VARS[var]].default
    assert f"- {var}=${{{var}:-{default}}}" in text, f"{compose} does not pass {var}"


@pytest.mark.parametrize(("configured", "warned"), [("", True), ("172.18.0.0/16", False)])
def test_the_boot_says_when_the_source_tier_is_off_behind_a_proxy(
    isolated_storage, monkeypatch: pytest.MonkeyPatch, configured, warned
):
    """R2: with TRUSTED_PROXIES empty, nginx's address is not counted as a source. The operator
    must be able to see that the source tier is off, not infer it from the docs."""
    from fastapi.testclient import TestClient

    from app import main

    seen: list[str] = []
    real_warning = main.logger.warning

    def capture(message, *args, **kwargs):
        seen.append(message)
        return real_warning(message, *args, **kwargs)

    monkeypatch.setattr(settings, "trusted_proxies", configured)
    monkeypatch.setattr(main.logger, "warning", capture)
    with TestClient(main.app):
        pass
    assert any(m.startswith("TRUSTED_PROXIES is not set") for m in seen) is warned
