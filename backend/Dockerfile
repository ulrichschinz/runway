FROM archlinux@sha256:204e91950fd364961088a01773eee9012243b7e965fed42b1d82d12416190782 AS task-builder
# Reproducible, which is the whole point of this stage (finding SEC-9).
#
# Three things were wrong before, and only the first is obvious:
#
#   archlinux:latest   a floating tag — the base moved whenever Arch rebuilt it
#   pacman -Sy         sync without upgrade: the classic partial-upgrade pattern, and it
#                      installed whatever `task` Arch published that day
#   NoExtract          the Arch image drops /usr/share/doc, where Taskwarrior 3.5.0 keeps
#                      the theme files it refuses to start without (incident 2026-08-25)
#
# The digest pins the base. The Arch Linux Archive pins the *package repository* to a dated
# snapshot, which is what actually pins the binary: a digest alone would not, because pacman
# resolves against live mirrors at build time. `task` is the engine of this product, and its
# version was previously a function of the calendar.
#
# Bumping the snapshot date is a deliberate act. It is the supply-chain equivalent of
# updating a lockfile, and the container tier is what proves the new binary still behaves.
RUN printf 'Server=https://archive.archlinux.org/repos/2026/08/25/$repo/os/$arch\n' \
      > /etc/pacman.d/mirrorlist \
 && sed -i '/^NoExtract/d' /etc/pacman.conf \
 && pacman -Syu --noconfirm task \
 && task --version

FROM python:3.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17

COPY --from=task-builder /usr/bin/task /usr/local/bin/task
# Taskwarrior 3.5.0 refuses to run without its theme files: every invocation fails with
# "Could not find file in CWD, directory of config file or search paths 'default.theme'".
# Earlier releases needed only the binary, which is why copying just /usr/bin/task worked
# until the Arch package rolled forward. The binary alone is not the program.
COPY --from=task-builder /usr/share/doc/task/rc/ /usr/share/doc/task/rc/

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgnutls30 \
    && rm -rf /var/lib/apt/lists/*

# The user the service runs as (finding SEC-003, ADR 0048). Numeric and fixed, so the compose
# file, the host's volume ownership and RULE-OPS-004 can all name it without resolving a name
# that could map to anything: uid and gid 10001, no login shell, no home directory. It owns two
# directories in this image, /app/data and /app/db, and nothing else — the application code
# below stays root-owned and is therefore read-only to the process that runs it.
RUN groupadd --system --gid 10001 runway \
 && useradd --system --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent \
      --shell /usr/sbin/nologin runway

WORKDIR /app

# The lock, not the range. requirements.txt names nine direct dependencies; the lock names
# every transitive one with its hash, and --require-hashes makes pip refuse anything whose
# artefact does not match. On 2026-08-04 an unpinned transitive (mcp 2.0.0) shipped an image
# whose backend could not start, through a green deploy (ADR 0004). This is that class closed.
COPY backend/requirements.txt backend/requirements.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock

COPY backend/taskrc_template.txt .
COPY backend/log_config.json .
COPY backend/app/ ./app/

# The Claude skill, carried by the server that speaks it (ADR 0040). `GET /skill` reports the
# version and content hash of exactly this copy, so a client can install the skill that
# matches the API it is talking to instead of whatever `main` holds today. Three paths rather
# than the whole directory: the skill text, the hooks the plugin ships (ADR 0041) and the
# manifest that versions all of it are the release, and nothing else under integrations/
# belongs in a runtime image. The hooks are hashed but not zipped — the hash is what the
# post-deploy check compares against ops/skill-release.json, so it has to cover what a plugin
# update delivers.
COPY integrations/claude/skills/runway /app/integrations/claude/skills/runway
COPY integrations/claude/hooks /app/integrations/claude/hooks
COPY integrations/claude/.claude-plugin/plugin.json /app/integrations/claude/.claude-plugin/plugin.json

# The two writable places, and the only ones the runtime user owns. /app/data is DATA_ROOT; /app/db
# holds users.db and, beside it, the rollback journal SQLite creates for every write. The journal
# is why the database needs a directory of its own: until 2026-11 it was created in /app, the
# image's own layer, where a read-only root or an unprivileged user cannot write and where it was
# lost whenever the container was recreated. In the deployment both are bind mounts that cover
# these directories; the ownership here is what a fresh volume starts from.
RUN mkdir -p /app/data /app/db \
 && chown 10001:10001 /app/data /app/db \
 && chmod 0700 /app/data /app/db

# The operator's tool for handing an existing deployment's volumes to uid 10001 — dry-run by
# default, targeted, never through a link (docs/operations.md#container-hardening). Outside /app
# so that nothing on the application's import path is beside it.
COPY ops/deploy/volume_ownership.py /opt/runway/volume_ownership.py

# The deployed compose file, carried by the image it belongs to.
#
# The host's shared deploy script (/opt/scripts/deploy.sh, used by every service on that
# box) iterates the stack's images, extracts /opt/stack/docker-compose.yml from the first
# image that carries one, and writes it over the on-disk compose before pulling. An image
# without this file leaves the host's copy untouched — which is exactly what runway did
# until now, and why the host's compose sat unchanged for six days while deploys succeeded.
#
# The path is deliberately service-agnostic: the host script carries no vendor name, and
# this repository does not get to be a special case in it.
#
# This is why the build context is the repository root rather than ./backend — the compose
# has one source of truth, ops/deploy/docker-compose.yml, and baking a copy of it would
# reintroduce the drift this removes. It is static and secret-free; RULE-HYG-003 fails the
# gate if a literal ever replaces a ${...} reference, and the host's .env is never touched.
COPY ops/deploy/docker-compose.yml /opt/stack/docker-compose.yml

# Which commit this image was built from, as the last layer so that every layer above it is
# cacheable across builds. deploy.yml passes RUNWAY_COMMIT=${{ github.sha }}; a local build
# leaves it unset and `GET /skill` then answers "dev".
#
# A file and not an environment variable: RULE-SURF-002 holds README.md and the settings
# object together in both directions, and a build stamp is not configuration. Not
# FastAPI(version=) either, which is a public surface RULE-SURF-001 snapshots — the sha would
# make every build a schema change.
ARG RUNWAY_COMMIT=unknown
RUN printf '%s\n' "$RUNWAY_COMMIT" > /app/BUILD_COMMIT

# --log-config replaces uvicorn's own loggers, so the access lines, the application lines and
# any traceback all leave this container as JSON on one stream, through one redaction filter.
# Without it uvicorn installs plain-text handlers of its own before the application is even
# imported, and those lines would bypass the filter entirely (ADR 0024).
#
# log_config.json is generated from app.logging_setup.dict_config and a unit test holds the
# two together; edit the module, then regenerate, never the other way round.
#
# The image runs as uid 10001 by default. The deploy compose still overrides that to uid 0 until
# the operator has migrated the host's volume ownership (SHIM-OPS-001) — the image is ready
# before the data is, which is the order the migration needs. RULE-OPS-004 holds this line to a
# numeric, non-root user that matches the compose.
USER 10001:10001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--log-config", "log_config.json"]
