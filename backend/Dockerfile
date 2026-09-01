FROM archlinux@sha256:b860afd5823683f7ea389ba5f00d812f4fe55f6f286dea329d2abeefa535e309 AS task-builder
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

RUN mkdir -p /app/data

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

# --log-config replaces uvicorn's own loggers, so the access lines, the application lines and
# any traceback all leave this container as JSON on one stream, through one redaction filter.
# Without it uvicorn installs plain-text handlers of its own before the application is even
# imported, and those lines would bypass the filter entirely (ADR 0024).
#
# log_config.json is generated from app.logging_setup.dict_config and a unit test holds the
# two together; edit the module, then regenerate, never the other way round.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--log-config", "log_config.json"]
