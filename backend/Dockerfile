FROM archlinux:latest AS task-builder
RUN pacman -Sy --noconfirm task

FROM python:3.12-slim

COPY --from=task-builder /usr/bin/task /usr/local/bin/task

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgnutls30 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN --network=host pip install --no-cache-dir -r requirements.txt

COPY taskrc_template.txt .
COPY app/ ./app/

RUN mkdir -p /app/data

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
