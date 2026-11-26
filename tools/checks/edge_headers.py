"""Hold the browser headers the nginx edge declares (RULE-OPS-005, finding SEC-004, ADR 0048).

Emits `RULE-ID|message` lines; `tools/checks/edge-headers.sh` turns them into gate failures.

frontend/nginx.conf is the last server of ours a browser talks to: Traefik in front of it
terminates TLS and routes, and is shared host infrastructure this repository does not own. So
the headers that bound what a browser does with this origin are declared here, and this check
holds the declaration to four properties that are each easy to lose in a one-line edit:

* **Every required header is present at server level, with `always`.** Without `always`, nginx
  adds a header to 2xx and 3xx only; the 404, 405 and 502 an attacker can provoke at will would
  go out bare.
* **No `location` declares an `add_header` of its own.** nginx inherits `add_header` only into a
  block that declares none, so one caching header added to `location /assets/` would silently
  strip every security header from every asset. That is the most likely regression and the
  least visible one.
* **The policies are same-origin only and report nowhere.** No `'unsafe-inline'`, no
  `'unsafe-eval'`, no host, no scheme wildcard, and no `report-uri` / `report-to`: the plan
  forbids a foreign reporting endpoint, and none of our own exists.
* **No HSTS.** This nginx speaks plain HTTP behind the TLS terminator. HSTS set here would claim
  something about hosts this file cannot see; it belongs on Traefik, after confirming every
  affected host is permanently HTTPS (docs/operations.md).

Which header carries the strict policy is a dated transition. While SHIM-WEB-001 stands it is
`Content-Security-Policy-Report-Only`, and the enforced `Content-Security-Policy` carries the
subset that cannot break the SPA (framing, plugins, base URI, form targets). Once the shim is
removed the strict policy must be the enforced one, and this check says so.

This reads a declaration. It does not prove what nginx sends — the container tier does that
against the built image — and neither proves what the public origin sends, which only the
post-deploy check in .github/workflows/deploy.yml reads.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
NGINX = ROOT / "frontend" / "nginx.conf"
SHIMS = ROOT / "rules" / "shims.yaml"
REPORT_ONLY_SHIM = "SHIM-WEB-001"

CSP = "content-security-policy"
CSP_RO = "content-security-policy-report-only"
REFERRER_POLICIES = {
    "no-referrer",
    "same-origin",
    "strict-origin",
    "strict-origin-when-cross-origin",
}
DENIED_FEATURES = ("camera", "microphone", "geolocation", "payment", "usb")

# Directives every policy, enforced or not, must carry with exactly this value.
BASELINE = {"frame-ancestors": {"'none'"}, "object-src": {"'none'"}, "base-uri": {"'none'"}}

# The strict policy: same origin for everything, and data: only where the build needs it.
STRICT_REQUIRED = ("default-src", "script-src", "style-src", "connect-src")
SELF_ONLY = {"'self'", "'none'"}
DATA_ALLOWED = {"img-src", "font-src"}

problems: list[str] = []


def fail(message: str) -> None:
    problems.append(f"RULE-OPS-005|{message}")


@dataclass
class Directive:
    name: str
    args: list[str]
    block: list[Directive] | None = None
    children: list[Directive] = field(default_factory=list)


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c.isspace():
            i += 1
        elif c == "#":
            while i < n and text[i] != "\n":
                i += 1
        elif c in "{};":
            tokens.append(c)
            i += 1
        elif c in "'\"":
            end = text.find(c, i + 1)
            if end < 0:
                raise ValueError("unterminated quote")
            tokens.append(text[i + 1 : end])
            i = end + 1
        else:
            start = i
            while i < n and not text[i].isspace() and text[i] not in "{};":
                i += 1
            tokens.append(text[start:i])
    return tokens


def parse(tokens: list[str]) -> list[Directive]:
    stack: list[list[Directive]] = [[]]
    current: list[str] = []
    for tok in tokens:
        if tok == ";":
            if current:
                stack[-1].append(Directive(current[0], current[1:]))
            current = []
        elif tok == "{":
            block: list[Directive] = []
            stack[-1].append(Directive(current[0] if current else "", current[1:], block))
            stack.append(block)
            current = []
        elif tok == "}":
            if len(stack) == 1:
                raise ValueError("unbalanced '}'")
            stack.pop()
        else:
            current.append(tok)
    if len(stack) != 1:
        raise ValueError("unbalanced '{'")
    return stack[0]


def walk(directives: list[Directive]):
    for d in directives:
        yield d
        if d.block is not None:
            yield from walk(d.block)


def policy(value: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for part in value.split(";"):
        words = part.split()
        if words:
            out[words[0].lower()] = words[1:]
    return out


def check_policy(label: str, directives: dict[str, list[str]], strict: bool) -> None:
    for name, required in BASELINE.items():
        if set(directives.get(name, [])) != required:
            want = " ".join(sorted(required))
            fail(f"{label} must carry `{name} {want}` (has {directives.get(name)!r})")

    for name in ("report-uri", "report-to"):
        if name in directives:
            fail(
                f"{label} declares `{name}`. No foreign reporting endpoint (plan M7.4), and this "
                "application has none of its own"
            )

    for name, sources in directives.items():
        allowed = SELF_ONLY | ({"data:"} if name in DATA_ALLOWED else set())
        for source in sources:
            if source.lower() not in allowed:
                fail(
                    f"{label} allows `{source}` in `{name}`. Only 'self' and 'none' are allowed"
                    + (" (and data: here)" if name in DATA_ALLOWED else "")
                )

    if strict:
        for name in STRICT_REQUIRED:
            if name not in directives:
                fail(f"{label} is the strict policy and has no `{name}`")
        if directives.get("default-src") != ["'self'"]:
            fail(f"{label} is the strict policy and must say `default-src 'self'`")


def main() -> int:
    if not NGINX.exists():
        fail("frontend/nginx.conf is missing")
        return report()
    try:
        tree = parse(tokenize(NGINX.read_text(encoding="utf-8")))
    except (ValueError, IndexError) as error:
        fail(f"frontend/nginx.conf could not be parsed: {error}")
        return report()

    servers = [d for d in tree if d.name == "server" and d.block is not None]
    if len(servers) != 1:
        fail(f"frontend/nginx.conf declares {len(servers)} server blocks; this check expects one")
        return report()
    server = servers[0]

    headers: dict[str, tuple[str, bool]] = {}
    for d in server.block or []:
        if d.name == "add_header" and d.args:
            name = d.args[0].lower()
            value = d.args[1] if len(d.args) > 1 else ""
            if name in headers:
                fail(f"`add_header {d.args[0]}` is declared twice in the server block")
            headers[name] = (value, d.args[-1] == "always")

    for d in walk(server.block or []):
        if d.block is not None:
            for inner in walk(d.block):
                if inner.name == "add_header":
                    fail(
                        f"`{d.name} {' '.join(d.args)}` declares `add_header` of its own, which "
                        "stops it inheriting every security header from the server block"
                    )
        if d.name == "add_header" and d.args and d.args[0].lower() == "strict-transport-security":
            fail(
                "frontend/nginx.conf sets Strict-Transport-Security. This nginx is plain HTTP "
                "behind the TLS terminator; HSTS belongs there (docs/operations.md)"
            )

    required = [CSP, "x-content-type-options", "referrer-policy", "x-frame-options"]
    required.append("permissions-policy")
    shim = REPORT_ONLY_SHIM in declared_shims()
    if shim:
        required.append(CSP_RO)
    for name in required:
        if name not in headers:
            fail(f"frontend/nginx.conf does not declare `add_header {name}` at server level")
        elif not headers[name][1]:
            fail(
                f"`add_header {name}` has no `always`, so nginx omits it from 4xx and 5xx "
                "responses — the ones an attacker can provoke"
            )

    def value(name: str) -> str:
        return headers.get(name, ("", False))[0]

    if headers.get("x-content-type-options") and value("x-content-type-options") != "nosniff":
        fail("X-Content-Type-Options must be `nosniff`")
    if headers.get("x-frame-options") and value("x-frame-options").upper() != "DENY":
        fail("X-Frame-Options must be `DENY`: nothing frames this application")
    if headers.get("referrer-policy") and value("referrer-policy") not in REFERRER_POLICIES:
        fail(
            f"Referrer-Policy `{value('referrer-policy')}` is not one of {sorted(REFERRER_POLICIES)}"
        )
    if headers.get("permissions-policy"):
        features = {p.strip() for p in value("permissions-policy").split(",")}
        for feature in DENIED_FEATURES:
            if f"{feature}=()" not in features:
                fail(f"Permissions-Policy must deny `{feature}=()`; the SPA uses none of these")

    if headers.get(CSP):
        check_policy("Content-Security-Policy", policy(value(CSP)), strict=not shim)
    if headers.get(CSP_RO):
        check_policy("Content-Security-Policy-Report-Only", policy(value(CSP_RO)), strict=shim)

    return report()


def declared_shims() -> set[str]:
    if not SHIMS.exists():
        return set()
    data = yaml.safe_load(SHIMS.read_text(encoding="utf-8")) or {}
    return {str(s.get("id")) for s in data.get("shims", []) or [] if isinstance(s, dict)}


def report() -> int:
    for problem in problems:
        print(problem)
    return 0


if __name__ == "__main__":
    sys.exit(main())
