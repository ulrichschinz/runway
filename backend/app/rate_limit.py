"""The login budget: reserved before the work, bounded in memory (SEC-8, REV-003, brief 0069).

`POST /auth/login` had no limit of any kind until SEC-8, so a password could be brute-forced at
whatever rate the network allowed. The KDF makes each attempt cost something, which is a cost
ceiling, not a control: it slows an attacker down without ever stopping one.

**Reserve, then work, then close.** The SEC-8 limiter checked the budget before the asynchronous
account lookup and counted a failure after the password check, so fifty parallel requests all
passed the check before the first failure was counted (REV-003). Now `reserve` takes one slot in
every tier under one lock, *before* the handler awaits anything, and a tier is full when its
failures **plus the attempts in flight** reach its budget. The reservation is closed exactly
once: `succeed`, `fail`, or — when the block is left any other way, by an exception or a
cancelled request — as a failure. A refused attempt costs no lookup and no KDF work.

**Three tiers, each a hard ceiling** (plan M3.2):

- *account* — the attempted name, NFKC-normalised and casefolded, so spelling variants share
  one budget. Someone who knows a username can deny it password login for the window; that
  trade is unchanged since SEC-8 and stated in docs/security.md. A success clears this tier only,
  and only the failures recorded under its own exact name: `Alice` and `alice` can be two accounts
  (the column is case-sensitive) that share one budget, and one must not wipe the other's count
  (review R10).
- *source* — the network address `source_of` decides: the socket peer, or, behind a proxy listed
  in `TRUSTED_PROXIES`, the right-most hop of `X-Forwarded-For` that is not a trusted proxy.
  Stops a password spray across many names from one place. IPv6 is grouped by /64. With
  `TRUSTED_PROXIES` empty, a proxy-shaped peer (loopback, RFC 1918, link-local, IPv6 ULA) gets
  no source key at all: it is almost certainly a proxy nobody declared, and counting it would
  put every client behind it into one budget any one of them could exhaust (review R2). With
  `TRUSTED_PROXIES` set, a proxy-shaped peer that is not listed but sends `X-Forwarded-For` is a
  proxy that moved (a recreated container) and gets no source key either, with a WARNING at most
  once per window (review R9).
- *global* — one key: the emergency brake on the KDF work failed verifications cause, sized
  from the measured cost of one (docs/security.md), against a spray from everywhere.

Every password verification goes through `reserve` — `POST /auth/login` and the current-password
check of `PUT /auth/password`, whatever credential authenticated the latter (review R1).

**Bounded.** Every key's failures expire after the window, a full sweep runs on a clock rather
than only when the same name comes back, and the account and source tiers hold at most
`LOGIN_RATE_MAX_KEYS` keys. A new key beyond that is *refused*, never made room for by evicting
an old one — evicting would let a flood of random names flush a victim's counter. Account keys
are 16-byte digests, so a long name costs the store 16 bytes.

**Refusals are counted, not written one by one.** The first refusal of a key in a window is
reported; later ones are counted and carried by the next report for that key, or by a summary
when the key is swept. `reserve` hands the reports to its caller, which writes them, so the
audit log holds a bounded number of rows per window and still says how many attempts were
refused. A source report never carries the address (ADR 0026: no caller fingerprint).

**In-process and per-worker on purpose** (`RISK-SEC-003`). It resets on restart and does not
coordinate across processes — the correct amount of machinery for one host and one worker (F1),
and the wrong amount for anything larger: a second worker multiplies every budget by the process
count. `tests/unit/test_login_budget.py` (`TestTheSingleWorkerAssumption`,
`TestTheSingleWorkerPinIsWholeFile`) fails when the Dockerfile's CMD stops pinning `--workers 1`,
the Dockerfile sets `WEB_CONCURRENCY` or an `ENTRYPOINT` or uses gunicorn, or a compose file sets
`WEB_CONCURRENCY`, `replicas`, `scale` or `--workers`; a shared limiter is then a precondition,
not a follow-up. It reads files; it does not watch a running host.
"""

from __future__ import annotations

import hashlib
import ipaddress
import logging
import threading
import time
import unicodedata
from collections import deque
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from types import TracebackType

from app.config import settings

ACCOUNT = "account"
SOURCE = "source"
GLOBAL = "global"
TIERS = (ACCOUNT, SOURCE, GLOBAL)
# The store-is-full refusal is reported under its own name, once per tier and window.
CAPACITY = "capacity"

# One shared key each, so neither can be varied per request to buy a fresh budget.
UNKNOWN_SOURCE = "unknown"
UNPARSEABLE_SOURCE = "unparseable"

_GLOBAL_KEY = "*"
# A failure recorded outside the account tier carries no name.
_NO_NAME = b""
# A report names the account as it was first attempted; a 16 KiB name is not kept whole.
_LABEL_MAX = 64
# How often a full sweep runs at most, on top of the sweep a full tier triggers.
_SWEEP_EVERY = 60.0

Network = ipaddress.IPv4Network | ipaddress.IPv6Network

logger = logging.getLogger(__name__)


def _now() -> float:
    return time.monotonic()


# --- the store -------------------------------------------------------------------------------


@dataclass
class _Bucket:
    # (when, digest of the exact name) per failure, oldest first; the name only in the account
    # tier, so a success can clear the failures of its own spelling and no other (R10).
    failures: deque[tuple[float, bytes]] = field(default_factory=deque)
    pending: int = 0
    unreported: int = 0  # refusals not yet carried by a report
    reported_at: float | None = None
    label: str | None = None  # account tier only: the name as first attempted, truncated


_lock = threading.Lock()
_store: dict[str, dict[object, _Bucket]] = {tier: {} for tier in TIERS}
_capacity: dict[str, _Bucket] = {}  # tier -> the bucket that counts "store full" refusals
_last_sweep = 0.0
# Summaries a sweep produced, waiting for the next `reserve` to hand them to its caller.
_swept: list[Report] = []


@dataclass(frozen=True)
class Report:
    """One audit row's worth of refusals. `actor` is the attempted name for the account tier
    and None for every other tier: a source report must not carry the address."""

    tier: str
    actor: str | None
    refusals: int
    retry_after: int | None  # set on the first report of a lockout; None on a summary

    @property
    def detail(self) -> str:
        if self.retry_after is not None:
            text = f"locked out by the {self.tier} budget, retry in {self.retry_after}s"
        else:
            text = f"further attempts refused by the {self.tier} budget in its last window"
        return f"{text} (refusals: {self.refusals})"


@dataclass(frozen=True)
class Decision:
    """What `reserve` decided. Exactly one of `reservation` and `tier` is set."""

    reservation: Reservation | None
    tier: str | None
    retry_after: int
    reports: tuple[Report, ...]


class Reservation:
    """One login attempt's slot in every tier. Close it exactly once; a second close is a
    no-op. Used as a context manager, leaving the block without closing it is a failure."""

    def __init__(self, keys: dict[str, object], name: bytes = _NO_NAME) -> None:
        self._keys = keys  # a tier left out is not counted
        self._name = name  # exact_name_digest of the name attempted
        self._open = True

    def succeed(self) -> None:
        """Proving the password releases the slot and clears the account's failures recorded
        under this exact name — not another spelling's, which may be another account (R10), and
        not the source's or the global ones, or a valid account would refill a spray's budget."""
        self._close(failed=False)

    def fail(self) -> None:
        self._close(failed=True)

    def _close(self, *, failed: bool) -> None:
        with _lock:
            if not self._open:
                return
            self._open = False
            now = _now()
            for tier, key in self._keys.items():
                bucket = _store[tier].get(key)
                if bucket is None:  # reset_all ran while this attempt was in flight
                    continue
                bucket.pending = max(0, bucket.pending - 1)
                if failed:
                    bucket.failures.append((now, self._name if tier == ACCOUNT else _NO_NAME))
                elif tier == ACCOUNT:
                    bucket.failures = deque(f for f in bucket.failures if f[1] != self._name)

    def __enter__(self) -> Reservation:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        # A cancelled request or an exception between reserve and close must neither escape
        # the budget nor leak its slot.
        self.fail()


def _limit(tier: str) -> int:
    return {
        ACCOUNT: settings.login_rate_limit,
        SOURCE: settings.login_source_rate_limit,
        GLOBAL: settings.login_global_rate_limit,
    }[tier]


def _prune(bucket: _Bucket, now: float, window: float) -> None:
    while bucket.failures and now - bucket.failures[0][0] >= window:
        bucket.failures.popleft()


def _sweep_locked(now: float) -> None:
    """Drop every key with no live failure and no attempt in flight, everywhere."""
    global _last_sweep
    _last_sweep = now
    window = settings.login_rate_window_seconds
    for tier, buckets in _store.items():
        for key in list(buckets):
            bucket = buckets[key]
            _prune(bucket, now, window)
            if bucket.failures or bucket.pending:
                continue
            if bucket.unreported:
                _swept.append(Report(tier, bucket.label, bucket.unreported, None))
            del buckets[key]
    for tier in list(_capacity):
        bucket = _capacity[tier]
        if bucket.reported_at is not None and now - bucket.reported_at < window:
            continue
        if bucket.unreported:
            _swept.append(Report(CAPACITY, None, bucket.unreported, None))
        del _capacity[tier]


def _retry_after(bucket: _Bucket, limit: int, now: float, window: float) -> int:
    """Seconds until enough failures expire for one more attempt to fit."""
    excess = len(bucket.failures) + bucket.pending - limit + 1
    if excess <= 0 or excess > len(bucket.failures):
        return 1  # held by attempts in flight, which close within a request's lifetime
    expires = bucket.failures[excess - 1][0] + window
    return max(1, int(expires - now) + 1)


def _refuse(tier: str, bucket: _Bucket, retry: int, now: float, window: float) -> Report | None:
    """Count one refusal; return a report if this one opens the key's window."""
    bucket.unreported += 1
    if bucket.reported_at is not None and now - bucket.reported_at < window:
        return None
    report = Report(tier, bucket.label, bucket.unreported, retry)
    bucket.unreported = 0
    bucket.reported_at = now
    return report


def account_key(username: str) -> bytes:
    """The account tier's key: spelling variants of one name are one key, of fixed size."""
    canonical = unicodedata.normalize("NFKC", username).casefold()
    return hashlib.blake2b(canonical.encode("utf-8", "surrogatepass"), digest_size=16).digest()


def exact_name_digest(username: str) -> bytes:
    """The exact name, as the account lookup compares it (BINARY): what a success proved."""
    return hashlib.blake2b(username.encode("utf-8", "surrogatepass"), digest_size=16).digest()


def reserve(username: str, source: str | None) -> Decision:
    """Take one slot in every tier, or refuse without taking any. Never blocks on I/O.

    `source` None means no source tier for this attempt (`source_of` found no address worth
    counting); the account and global tiers apply regardless."""
    global _swept
    with _lock:
        now = _now()
        window = settings.login_rate_window_seconds
        max_keys = settings.login_rate_max_keys
        keys: dict[str, object] = {ACCOUNT: account_key(username), GLOBAL: _GLOBAL_KEY}
        if source is not None:
            keys[SOURCE] = source
        if now - _last_sweep >= min(window, _SWEEP_EVERY) or any(
            len(_store[t]) >= max_keys for t in (ACCOUNT, SOURCE)
        ):
            _sweep_locked(now)

        refusal: tuple[str, int, Report | None] | None = None
        # Global first: when everything is refused, the report that matters is the brake.
        for tier in (GLOBAL, SOURCE, ACCOUNT):
            if tier not in keys:
                continue
            bucket = _store[tier].get(keys[tier])
            if bucket is None:
                if tier != GLOBAL and len(_store[tier]) >= max_keys:
                    full = _capacity.setdefault(tier, _Bucket())
                    retry = int(min(window, _SWEEP_EVERY))
                    refusal = (CAPACITY, retry, _refuse(CAPACITY, full, retry, now, window))
                    break
                continue
            _prune(bucket, now, window)
            limit = _limit(tier)
            if len(bucket.failures) + bucket.pending >= limit:
                retry = _retry_after(bucket, limit, now, window)
                refusal = (tier, retry, _refuse(tier, bucket, retry, now, window))
                break

        reports, _swept = list(_swept), []
        if refusal is not None:
            tier, retry, report = refusal
            if report is not None:
                reports.append(report)
            return Decision(None, tier, retry, tuple(reports))

        for tier in keys:
            bucket = _store[tier].get(keys[tier])
            if bucket is None:
                bucket = _store[tier][keys[tier]] = _Bucket()
                if tier == ACCOUNT:
                    bucket.label = username[:_LABEL_MAX]
            bucket.pending += 1
        return Decision(Reservation(keys, exact_name_digest(username)), None, 0, tuple(reports))


def key_count(tier: str | None = None) -> int:
    """How many keys the store holds — in one tier, or across all three."""
    with _lock:
        if tier is not None:
            return len(_store[tier])
        return sum(len(b) for b in _store.values())


def reset_all() -> None:
    """Test seam. Module state outlives a TestClient, so a suite that logs in repeatedly
    would otherwise trip the limiter in whichever test happened to run tenth."""
    global _last_sweep, _swept, _drift_warned_at
    with _lock:
        _drift_warned_at = None
        for buckets in _store.values():
            buckets.clear()
        _capacity.clear()
        _swept = []
        _last_sweep = 0.0


# --- the source ------------------------------------------------------------------------------


def trusted_networks(text: str) -> tuple[Network, ...]:
    """`TRUSTED_PROXIES` as networks. An entry that does not parse is skipped, and so is any
    network of prefix length 0: a mistake here must trust fewer hops, never every hop."""
    networks: list[Network] = []
    for entry in text.split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            network = ipaddress.ip_network(entry, strict=False)
        except ValueError:
            continue
        if network.prefixlen == 0:
            continue
        networks.append(network)
    return tuple(networks)


def rejected_proxy_entries(text: str) -> int:
    """How many `TRUSTED_PROXIES` entries `trusted_networks` skipped — for the boot line."""
    entries = [e for e in (part.strip() for part in text.split(",")) if e]
    return len(entries) - len(trusted_networks(text))


def _address(text: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    text = text.strip()
    if text.startswith("[") and "]" in text:  # "[2001:db8::1]:443"
        text = text[1 : text.index("]")]
    try:
        address = ipaddress.ip_address(text)
    except ValueError:
        return None
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        return address.ipv4_mapped
    return address


def _key_of(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str:
    if isinstance(address, ipaddress.IPv6Address):
        # One host usually holds a whole /64; counting each address would give it 2^64 budgets.
        return str(ipaddress.IPv6Network((address, 64), strict=False))
    return str(address)


# The addresses a reverse proxy on this host or its container network has. Without
# TRUSTED_PROXIES such a peer is counted as no source rather than as one source for everybody.
_PROXY_SHAPED: tuple[Network, ...] = tuple(
    ipaddress.ip_network(n)
    for n in (
        "127.0.0.0/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "169.254.0.0/16",
        "::1/128",
        "fc00::/7",
        "fe80::/10",
    )
)


def proxy_shaped(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Whether an address is one a local reverse proxy would connect from."""
    return _is_trusted(address, _PROXY_SHAPED)


_drift_warned_at: float | None = None


def _warn_undeclared_proxy() -> None:
    """R9: a proxy moved off its declared address. Said at most once per window, and without
    the address: the operator needs to know it happens, not who it was."""
    global _drift_warned_at
    with _lock:
        now = _now()
        if (
            _drift_warned_at is not None
            and now - _drift_warned_at < settings.login_rate_window_seconds
        ):
            return
        _drift_warned_at = now
    logger.warning(
        "login request from an undeclared proxy: a private peer not in TRUSTED_PROXIES sent "
        "X-Forwarded-For, so the login source budget does not apply to it; a proxy container "
        "has probably moved (see docs/operations.md, The login budget)"
    )


def _is_trusted(
    address: ipaddress.IPv4Address | ipaddress.IPv6Address, trusted: Iterable[Network]
) -> bool:
    return any(address.version == net.version and address in net for net in trusted)


def source_of(
    peer: str | None, forwarded_for: Sequence[str], trusted: Sequence[Network]
) -> str | None:
    """The source tier's key for one request, or None for no source tier.

    The socket peer, unless the peer is a trusted proxy: then `X-Forwarded-For` is read from the
    right, past every trusted hop, to the first address that is not one. What lies to the left of
    that address was written by the client and is never read. Every `X-Forwarded-For` line is one
    chain, in order.

    With no trusted proxy configured, a proxy-shaped peer yields None: it is a proxy nobody has
    declared, and its address would make every client behind it one budget (review R2). With
    trusted proxies configured, a proxy-shaped peer that is not one of them but forwards a chain
    is a declared proxy that came back at another address (review R9): None too, and a warning.
    """
    if peer is None:
        return UNKNOWN_SOURCE
    current = _address(peer)
    if current is None:
        return UNPARSEABLE_SOURCE
    if not trusted:
        return None if proxy_shaped(current) else _key_of(current)
    hops = [hop for line in forwarded_for for hop in line.split(",") if hop.strip()]
    if not _is_trusted(current, trusted):
        if hops and proxy_shaped(current):
            _warn_undeclared_proxy()
            return None
        return _key_of(current)
    for hop in reversed(hops):
        address = _address(hop)
        if address is None:
            return UNPARSEABLE_SOURCE
        current = address
        if not _is_trusted(address, trusted):
            break
    return _key_of(current)
