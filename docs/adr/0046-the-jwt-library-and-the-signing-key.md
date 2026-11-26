# ADR 0046 — The JWT library and the signing key

- **Date:** 2026-11-25
- **Status:** Accepted
- **Scope:** `backend/app/auth.py` (encode/decode), `backend/app/config.py` (`JWT_SIGNING_ALGORITHM`;
  `jwt_algorithm` kept as `SHIM-SEC-010`), `backend/app/startup_checks.py`, `backend/requirements.txt` and
  both locks, `tools/surfaces.py`, `backend/tests/conftest.py`
- **Brief:** [0072](../briefs/0072-one-jwt-algorithm-a-real-key-and-patched-dependencies.md)
- **Amends:** [ADR 0021](0021-supply-chain-pinning.md) (its *python-jose 3.3.0 → 3.5.0* decision) and
  [ADR 0018](0018-cors-startup-refusal-and-the-inbox-shim.md) (what the startup refusal refuses)

Milestone M7.1 of the security remediation plan, finding **SEC-002** of the November 2026 review
(`partially_upheld`, low): both python-jose CVEs affect the locked version; in this application's HMAC
operation their key preconditions do not hold; `HS256` was a configurable default, and the startup check
measured no entropy; a fixed "3.5.1" is not supported by the release sources.

## Context

- **python-jose 3.5.0** (2025-05-28) is the latest release on PyPI and the latest upstream GitHub release
  (both checked 2026-11-25). OSV lists GHSA-3qf3-8w2g-rqmx (CVE-2024-33663, CVE-2026-85394 — the
  algorithm-confusion guard bypassed by a DER-encoded public key) with no fixed version; the CNA record
  of CVE-2026-120459 (an empty HMAC key accepted) names "through 3.5.0". There is no release to upgrade
  to; waiting means waiting with no date.
- Its dependency `ecdsa` 0.19.2 carries CVE-2024-23342 (Minerva), unfixed upstream; `rsa`, `pyasn1` and
  `six` came with it. None is used by this application.
- **PyJWT** is already in the image: `mcp` 1.29.0 requires `pyjwt[crypto]>=2.10.1`, and the lock held
  2.13.0. OSV lists fifteen advisories for 2.13.0: fourteen fixed in 2.14.0 or 2.15.0 — among them
  GHSA-p4g4-x82p-q773 (a DER public key accepted as an HMAC secret, the same class as python-jose's),
  GHSA-9j54-fg26-wv3r (empty HMAC key via `PyJWK`) and GHSA-8wjv-2p76-3863 (RecursionError on a nested
  header) — and GHSA-gvp8-978c-rx2q (options-dict mutation), last affected 2.13.0. OSV lists none for
  2.15.1 (2026-09-28).
- The application uses exactly: HS256 encode of five claims, HS256 decode with `exp` and `sub`
  required, and nothing else — no JWK, no JWKS, no asymmetric key, no key from a request.
- The startup check (finding SEC-1) refused an empty value, five defaults and anything under 32
  characters. `.env.example`'s `replace-with-a-long-random-string` is 33 characters and started; so did
  `xxxxxxxx…` and a PEM public key.

## Decision 1 — migrate to PyJWT 2.15.1

`PyJWT==2.15.1` is a direct pin in `requirements.txt`; `python-jose` is removed, and with it `ecdsa`,
`rsa`, `pyasn1` and `six` leave both locks. No `[crypto]` extra: HS256 needs none (`mcp` still pulls
`cryptography` through its own requirement). 2.15.1 is older than two weeks; its hashes in the lock are
PyPI's published SHA-256.

The wire format does not change: a compact HS256 JWS with `{"alg":"HS256","typ":"JWT"}` and the same claims.
Verified on 2026-11-25 both ways with python-jose 3.5.0 in a scratch environment: a token it minted
decodes under `auth.decode_token`, and a token `create_access_token` minted decodes under python-jose. So
sessions survive the deploy and a rollback. `test_jwt_hardening.py` keeps the property without python-jose,
with tokens built and verified by hand from `hmac` and `base64`.

*Rejected:* waiting for an upstream fix (no release, no date; the plan forbids planning on "3.5.1");
`joserfc`/`authlib` (a new dependency where a maintained one is already installed); keeping python-jose with
the guards alone (the review's own point: a pinned algorithm list does not make an already-public HMAC key
safe — the key check has to).

## Decision 2 — the algorithm is the code's

`config.JWT_SIGNING_ALGORITHM = "HS256"`, a module constant, is what `create_access_token` signs with and the
only entry of `algorithms=[…]` in `decode_token`. The token's `alg` header selects nothing; `none`, `HS384`,
`HS512`, `RS256`, `hs256`, a missing or list-valued `alg`, and `jwk`/`jku`/`kid` headers are refused (the
library is never given a key from the token). `JWT_ALGORITHM` stays a field so an existing `.env` keeps
booting (pydantic-settings refuses unknown dotenv keys); `startup_checks` refuses any value but `HS256`.
That is the expand and switch of a public-surface migration; the contract is `SHIM-SEC-010` (expires
2027-05-31).

## Decision 3 — the key is refused by origin and by shape

`startup_checks.assert_jwt_secret_is_safe`, in this order, each with an instruction and never the value:

1. **Empty** (CVE-2026-120459's precondition).
2. **Published**: every value this repository has shipped or shows — the five defaults, `.env.example`,
   README, the former test, capture and fixture secrets — or one containing placeholder wording
   (`changeme`, `replace-with`, `your-secret`, …). `test_jwt_hardening.py` scans the repository's published
   text for every `JWT_SECRET` literal and fails if one boots; the test suite and `tools/surfaces.py`
   generate their key per run, so nothing bootable is written down.
3. **Key material**: a PEM block, an OpenSSH key, a JSON document with a `kty` or `keys` member anywhere
   (a JWK, a JWK set, a JWK array), or hex, base64 or base64url whose bytes are a DER SEQUENCE spanning
   exactly the value with a SEQUENCE or INTEGER first (SubjectPublicKeyInfo, PKCS#1, PKCS#8) or an
   uncompressed EC point that lies on P-256, P-384, P-521 or secp256k1 — the CVE-2024-33663/CVE-2026-85394
   precondition. And PyJWT's own `HMACAlgorithm.prepare_key` runs on the secret at boot: whatever the
   library would refuse at the first login refuses the start instead (review round 1 — a JWKS booted and
   then failed every login). *Not* recognised, deliberately: a raw Ed25519 key (any 32 bytes are one) and a
   compressed EC point (about half of all 33-byte strings starting `02`/`03` decompress to one); refusing
   them would refuse generated secrets.
4. **Shorter than 32 characters** (unchanged).
5. **A repeated unit**: the smallest period (KMP) at most half the length — `password` × 4,
   `0123456789abcdef` × 2.
6. **Estimated entropy under 80 bits**: length × the empirical Shannon entropy per character. In 200 000
   draws of `openssl rand -hex 16`, the weakest form the runbook accepts, the minimum was 89.6; base64 of
   48 bytes scores about 330.
7. **Mostly repetition** (review round 1: exact periodicity is bypassed by one appended character): the
   per-character entropy charged only for the characters a greedy LZ77 parse (copies of ≥ 3) cannot
   explain from earlier text — in the value or in its successive character differences, whichever explains
   more — refused under 56 bits. `password`×4+`!` scores 26, `Tr0ub4dor&3!`×3+`x` 46, the alphabet in order
   15; in 500 000 draws of `openssl rand -hex 16` the minimum was 65.4.

**The limit, stated:** no check can prove a value random. A long memorable phrase or a keyboard row passes
steps 5 to 7.
The origin check covers the values a reader of this repository knows; the runbook generates the secret
(`openssl rand -base64 48`); `python -m app.startup_checks` lets the operator run these checks against the
host's environment.

*Rejected:* a date-driven soak for the new refusals (as `API_KEY_LEGACY_CUTOFF` has) — every value they
refuse is either public or degenerate, i.e. a key someone else can sign with, which is the reasoning of
SEC-1: a container that refuses to start is a louder signal than one that serves forgeable tokens quietly.
The cost is real: merging to `main` deploys with no manual gate, so a production key that fails a new check
takes the backend down on the merge. The mitigation is a **pre-merge** check, not a pre-deploy one (review
round 1 — the image a pre-deploy check needs exists only after the merge has started the deploy): the
branch's `startup_checks.py` and `config.py`, mounted read-only over the deployed image's copies in a
`docker compose run` from the service directory (`docs/operations.md`, *The signing key*). Running it is a
merge blocker of brief 0072, an owner action on the host this repository cannot perform.

## Consequences

- SEC-002's closing criterion (plan §5) — fixed algorithm, a suitable secret check, a maintained and pinned
  dependency decision — is met in this repository. Whether the production secret passes is a fact of the
  host (deferred in brief 0072, `docs/operations.md`).
- A PyJWT bump must re-run `test_jwt_hardening.py`, `test_session_revocation.py` and the MCP suites (`mcp`
  uses PyJWT too).
- `SHIM-SEC-010` is owed: remove `JWT_ALGORITHM` once no `.env` sets it.
- The runtime image's closure is checked automatically: `deploy.yml` runs `tools/installed_matches_lock.py`
  inside the pushed backend image against its own `/app/requirements.lock` (every pin at its version,
  `python-multipart` ≥ 0.0.31, no `jose`/`ecdsa` importable) and `deploy` needs that step.
- **SEC-005 and this ADR ship on one branch.** The plan asks for SEC-005 as an isolated dependency PR; here
  it is the isolated first commit (`fcdfdec`). Merged together, rolling M7.1 back (the likeliest rollback:
  a production key that a new check refuses) also reinstates python-multipart 0.0.12. Whether to merge
  `fcdfdec` first on its own or to accept the bundle is the owner's decision (brief 0072, merge blockers).
