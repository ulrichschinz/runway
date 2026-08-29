#!/bin/sh
# The deploy key's forced command. Lives on the deploy host at
# /opt/services/runway/deploy-command.sh, referenced from the CI key's line in
# authorized_keys as command="/opt/services/runway/deploy-command.sh".
#
# WHY THIS FILE EXISTS AT ALL
#
# The CI deploy key is restricted by a forced command, so a compromised CI run gets exactly
# this script and never a shell. That control is worth keeping. What it also meant, until
# 2026-08-28, was that the compose file could not be deployed — only the images could. The
# host's docker-compose.yml was maintained by hand and ops/deploy/docker-compose.yml in the
# repository was a transcription of it.
#
# A transcription is accurate on the day it is taken. Three claims this repository made about
# production were each true when written and each drifted silently afterwards: the healthchecks
# did not run and then did, the rollback runbook was broken and then was not, and log rotation
# is checked in and still is not applied. Every one of them was found by reading the host, not
# by anything failing.
#
# So the compose file becomes part of the deployed artefact. The repository stops describing
# production and starts determining it, which is the only version of this that stays true.
#
# WHAT THIS COSTS
#
# Whatever is in ops/deploy/docker-compose.yml on main now decides what runs on this host, and
# compose can mount host paths, set environment and ask for privilege. That is a genuine
# widening: merging to main was container-scoped and is now host-scoped. It is bounded by
# RULE-OPS-003, which fails the gate on privileged containers, host network mode and bind
# mounts outside the service directory, and by RULE-HYG-003, which fails on a literal secret
# where a ${...} reference belongs. Neither is a substitute for main being protected.
#
# FAILING CLOSED
#
# If the commit cannot be determined, or the fetched file is not valid compose, this script
# stops and deploys nothing. The alternative — carrying on with the compose file already on
# disk — would silently reintroduce exactly the drift this exists to remove, and it would do
# it on the days something is already wrong.
set -eu

SERVICE_DIR=/opt/services/runway
REPO=ulrichschinz/runway
RAW=https://raw.githubusercontent.com/$REPO
SOURCE=ops/deploy/docker-compose.yml

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] REFUSED: %s\n' "$*" >&2; exit 1; }

# /opt/services/runway is owned by root and the `docker` group is empty (verified on the host
# 2026-08-29), so neither the compose writes below nor docker itself is reachable unprivileged.
# Deploys have been working, which means the key already arrives with the privilege it needs —
# but this resolves it rather than assuming which of the two ways that is true.
if [ "$(id -u)" = "0" ]; then
	SUDO=""
else
	command -v sudo >/dev/null 2>&1 || die "not root and no sudo. Nothing was deployed."
	SUDO="sudo -n"
fi

# `deploy <sha> --dry-run` fetches and validates, reports what it would change, and touches
# neither the compose file nor the running containers. The first use of a deploy path should
# not be the first time anyone finds out whether it works.
case "${SSH_ORIGINAL_COMMAND:-}${1:-}" in
*--dry-run*) DRY_RUN=1 ;;
*) DRY_RUN=0 ;;
esac

# The client asks for `deploy <sha>`. A forced command receives that request in
# SSH_ORIGINAL_COMMAND rather than running it, so this is the one piece of caller-controlled
# input here — and it is reduced to 40 hex characters before it is used for anything.
# Extracted by pattern rather than matched exactly, because the SSH client wraps the requested
# command in a shell invocation whose exact shape is the client's business, not ours.
sha=$(printf '%s' "${SSH_ORIGINAL_COMMAND:-}" | grep -oE '[0-9a-f]{40}' | head -n 1 || true)
[ -n "$sha" ] || die "no 40-character commit sha in the request. Nothing was deployed."

cd "$SERVICE_DIR" || die "$SERVICE_DIR is not there"
log "commit $sha"
[ "$DRY_RUN" = "1" ] && log "DRY RUN — nothing will be changed"

# Staged in /tmp rather than beside the target: the service directory is root-owned, and a
# fetch that cannot even be written should fail before it has touched anything privileged.
tmp=$(mktemp /tmp/runway-compose.XXXXXX) || die "cannot write a temporary file"
trap 'rm -f "$tmp"' EXIT INT TERM

curl -fsSL --max-time 30 -o "$tmp" "$RAW/$sha/$SOURCE" ||
	die "could not fetch $SOURCE at $sha. Nothing was deployed."

# `config -q` resolves ${...} against the .env beside the compose file, so this also catches a
# file naming a variable this host does not have — which is a deploy that would come up wrong
# rather than not at all, and therefore the more important of the two to stop here.
$SUDO docker compose -f "$tmp" --project-directory "$SERVICE_DIR" config -q ||
	die "the compose file at $sha is not valid on this host. Nothing was deployed."

if cmp -s "$tmp" docker-compose.yml; then
	log "compose unchanged"
elif [ "$DRY_RUN" = "1" ]; then
	log "compose WOULD change:"
	diff -u docker-compose.yml "$tmp" || true
else
	$SUDO cp docker-compose.yml "docker-compose.yml.bak-$(date +%F-%H%M%S)"
	$SUDO install -m 0644 -o root -g root "$tmp" docker-compose.yml
	log "compose updated from $sha (previous kept as docker-compose.yml.bak-*)"
fi

if [ "$DRY_RUN" = "1" ]; then
	log "dry run complete — no images pulled, no containers touched"
	exit 0
fi

log "pulling images"
$SUDO docker compose pull

log "starting"
$SUDO docker compose up -d --remove-orphans

log "done"
$SUDO docker compose ps
