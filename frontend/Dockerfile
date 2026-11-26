FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine@sha256:72ba65eb42c10344912a84ff42408db7d34f2feb642204570ab8fc5ffd29f1d3

# The user nginx runs as (finding SEC-003, ADR 0048): uid and gid 10002, no login shell, no home.
# A dedicated id rather than the image's own `nginx` (101), so that the number RULE-OPS-004 and
# the compose file name is one this repository chose and nothing else on a host shares by
# accident. It owns nothing in the image: the built SPA and every configuration file stay
# root-owned and read-only to it.
RUN addgroup -S -g 10002 runway-web \
 && adduser -S -D -H -u 10002 -G runway-web -h /nonexistent -s /sbin/nologin runway-web

COPY --from=build /app/dist /usr/share/nginx/html

# Our own main configuration in place of the image's. It moves the pid file, the five temp paths
# and the generated server block under /tmp — the one writable place — and drops the `user`
# directive, which only means something to a master process started as root.
COPY nginx-main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/runway/default.conf.template
ENV BACKEND_HOST=127.0.0.1

# Non-root, so it listens on 4000 rather than a privileged port, and needs no capability at all.
# /tmp is a tmpfs in the deploy compose and the image's own world-writable /tmp otherwise, so the
# image also starts outside that compose. `exec` hands PID 1 to nginx, so `docker stop` reaches it.
USER 10002:10002
CMD ["/bin/sh", "-c", "mkdir -p /tmp/nginx/conf.d && envsubst '${BACKEND_HOST}' < /etc/nginx/runway/default.conf.template > /tmp/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
