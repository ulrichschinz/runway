FROM archlinux:latest AS task-builder
# The Arch container image ships `NoExtract = usr/share/doc/*` in pacman.conf to stay small,
# and Taskwarrior keeps its theme files under /usr/share/doc/task/rc. Installing `task`
# without dropping that rule silently produces a package with no themes — `pacman -Ql task`
# still lists them, because it reports what the package declares, not what was extracted.
RUN sed -i '/^NoExtract/d' /etc/pacman.conf && pacman -Sy --noconfirm task

FROM python:3.12-slim

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

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY taskrc_template.txt .
COPY app/ ./app/

RUN mkdir -p /app/data

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
