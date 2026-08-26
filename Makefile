# Runway — repository task interface.
#
# One command surface over every ecosystem in this repository. Agents and humans use
# the same commands. This file contains no logic: every target delegates to ./run.
#
#   Exit codes, JSON output, runtime budgets:  docs/task-interface.md
#   Why make and not a task runner:            docs/adr/0001-task-interface-make-plus-posix-sh.md
#
# NOTE ON EXIT CODES: GNU make reports 2 for any failed recipe, so it cannot pass the
# documented exit codes through. When the exit code matters — automation, agents, CI
# branching — call ./run directly:  ./run check   ./run verify JSON=1
#
# Modifiers (any target):
#   JSON=1   machine-readable output on stdout
#   PLAN=1   print the resolved execution plan for check/verify without running it

SHELL := /bin/sh
.DEFAULT_GOAL := help

export RUNWAY_JSON = $(JSON)
export RUNWAY_PLAN = $(PLAN)

.PHONY: help doctor bootstrap check verify rebuild-verify test map impact flow similar violations mcp index brief scaffold fix grant-admin surfaces lock decay-review

help: ## List every task-interface command
	@./run help

doctor: ## Report whether this machine can build, test and verify the repository
	@./run doctor

bootstrap: ## Prepare a clean clone for development (idempotent)
	@./run bootstrap

check: ## Fast local gate — run before every commit
	@./run check

verify: ## Authoritative mergeability gate — a green run means "mergeable"
	@./run verify

rebuild-verify: ## Clean deterministic rebuild and equivalence validation of the index
	@./run rebuild-verify

test: ## Run the focused test suite for the changed scope
	@./run test

map: ## Locate a symbol or file and report the unit that owns it
	@./run map $(ARGS)

impact: ## Report the change-impact radius of a file, and the surfaces it touches
	@./run impact $(ARGS)

flow: ## Show the end-to-end path from a public surface to a file
	@./run flow $(ARGS)

similar: ## Find where something like this is already solved
	@./run similar $(ARGS)

violations: ## Report unit dependencies architecture.toml does not allow
	@./run violations

mcp: ## Serve the index over MCP on stdio
	@./run mcp

index: ## Build or refresh the repository knowledge graph
	@./run index

brief: ## Generate a Change Impact Brief for the working diff
	@./run brief

grant-admin: ## Promote an account to admin directly (escape hatch; needs --db)
	@./run grant-admin $(ARGS)

surfaces: ## Report public-surface drift (--update rewrites the snapshots)
	@./run surfaces $(ARGS)

lock: ## Regenerate the hash-pinned Python dependency locks
	@./run lock

scaffold: ## Create a new unit that is conformant by construction
	@./run scaffold

fix: ## Apply every deterministic, semantics-preserving repository-owned fix
	@./run fix

decay-review: ## Run the recurring agent-readiness decay review
	@./run decay-review
