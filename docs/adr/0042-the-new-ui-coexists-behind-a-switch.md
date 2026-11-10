# ADR 0042 — The new UI coexists behind a switch

- **Date:** 2026-11-01
- **Status:** Accepted
- **Scope:** `frontend/src/shared/uiFlag.js`, `frontend/src/router/`, `architecture.toml` (the
  frontend units' paths, and `fe/app` among the edges `tests` may use), `ops/structure-baseline.toml`
  (the hub allowlist), `ops/surfaces/spa.json` (the key `ui`), `.gitignore` (one negation for the
  design folder's demo data), `docs/design/2026-10-31-unified-ui/`
- **Brief:** [0046](../briefs/0046-the-new-ui-coexists-behind-a-switch.md)

## Context

On 2026-10-31 Uli chose a new UI for the web app, the design
[06-kombination](../design/2026-10-31-unified-ui/06-kombination/README.md). It replaces every view
of the SPA: the shell, the rows, the lists, the task detail, projects, review and settings, with a
new write path underneath. [The plan](../plan/unified-ui-web.md) puts it at about 59 person-days in
eighteen milestones.

Two constraints shape how that much change can reach users. **Every merge to `main` deploys**
(ADR 0005), and there are live users, Uli first among them. And **the new UI needs real use before
it can be trusted**: the plan's riskiest parts — held writes flushed on `pagehide`, the day progress
under concurrent writers, WebKit — only show their failures on a real account over days.

The obvious alternative is a long-lived branch merged when the new UI is finished. It fails both
constraints: weeks of divergence from `main`, one deploy that changes every screen for every user at
once, an image rollback as the only way back, and no real use of the new UI until that day.

## Decision 1 — one switch per browser, default the old UI

`frontend/src/shared/uiFlag.js` decides which UI a page load renders: `localStorage['ui']` holds
`alt` or `neu`; `?ui=neu` or `?ui=alt` on any URL stores that choice; any other value is ignored;
with no valid choice the default is `alt`. M16 changes the default to `neu`, and `?ui=alt` then still
reaches the old UI.

**Per browser, not per account.** It needs no backend change, no route, no migration, and nothing
that outlives the transition on the server. Desktop and phone opt in separately, which is what the
plan wants anyway (desktop first, the phone from M15). The cost is recorded: a choice does not
follow the user to another device.

**`localStorage`, under a literal key.** The SPA keeps its other per-browser state there (`theme`,
`token`), and `tools/surfaces.py` snapshots keys written as literals, so `ui` is a recorded public
surface from its first commit (`RULE-SURF-001`). Storage that refuses access degrades to the default,
or to the query's choice for that one page load.

## Decision 2 — every route renders through one wrapper; paths stay

`frontend/src/router/pick.js` exports `pick(OldView, NewPage)`, which returns a route's `component`
and `props`: the component is one wrapper shared by every route, the props are the two sides. The
wrapper renders the side `uiFlag.js` names. Paths, the redirect and `meta` are unchanged, so
bookmarks and the Android app's Custom Tab URLs keep working in both UIs.

**One wrapper type, not one per route.** Vue reuses a route's component when the next route renders
the same type, as `/projects` and `/projects/:name` do today. A wrapper per route would turn that
reuse into an unmount and a remount. With one wrapper, the inner component decides, exactly as
`RouterView` did before, so wrapping a route changes nothing about how its old view lives.
`frontend/tests/pick.test.js` holds `pick()` to that, because no screenshot shows a remount; the
`tests` unit may reach `fe/app` for it.

**The cost: options-API route guards are not read.** vue-router takes `beforeRouteEnter`,
`beforeRouteUpdate` and `beforeRouteLeave` off the route's component, which is now the wrapper, so
on a view or page they never run, and nothing reports it. No old view defines one. New pages use
`onBeforeRouteLeave` / `onBeforeRouteUpdate` in setup, which register on the matched route and are
removed on unmount, or a `beforeEnter` on the route record; `pick.js` and `frontend/AGENTS.md` say
so.

**Both sides imported statically.** A dynamic `import()` would keep the new UI out of the old UI's
bundle, but the index records dynamic targets as unknown (`BLIND-FE-002`) and would lose every router
→ page edge for the whole transition. The cost is a bundle carrying both UIs until M17, which the
plan budgets (entry JavaScript ≤ 130 kB gzip while both ship).

## Decision 3 — the new UI's folders are declared once, as globs of the existing units

Frontend units stay declared in `architecture.toml` over the files, and no file moves (MODE C). The
new UI's files go into one folder per unit — `frontend/src/layout/` (`fe/layout`),
`frontend/src/tasks/` (`fe/tasks`), `frontend/src/projects/` (`fe/projects`),
`frontend/src/identity/` (`fe/identity`), `frontend/src/assets/` (`fe/app`), `frontend/tokens/`
(`fe/shared`) — each added to its unit as a glob in this change. Later milestones then add files
without editing the contract; the owner-approval cost of `RISK-GOV-001` is paid here and in M17, not
in every milestone.

The new layout code receives what it shows through props and slots and imports no feature. The gate
cannot hold it to that yet: the allowed edges `fe/layout → fe/tasks, fe/identity` must stay while
the old `AppShell.vue` exists (`CYCLE-001`, `CYCLE-002`). The rule is written into the unit's note and
`frontend/AGENTS.md`, and M4 checks `AppFrame.vue` with `./run impact`.

## Decision 4 — four hubs by design, allowlisted before they exist

`RULE-ARCH-003` caps fan-in at four importers per file. Four modules of the new UI are meant to be
read by most of it: the message table's `t()` (`shared/i18n.js`), the list and payload rules shared
with Android (`shared/gtdRules.js`), the frame every page wraps itself in (`layout/AppFrame.vue`, the
successor of the allowlisted `AppShell.vue`), and the one snapshot store (`tasks/stores/gtd.js`). They
are allowlisted in `ops/structure-baseline.toml` with their reasons now, so the milestones that
create them do not each reopen the baseline. Any other raise is a dated line in the milestone that
causes it.

## Decision 5 — the design source is committed

`docs/design/2026-10-31-unified-ui/` (222 files as approved, 223 with the licence file below,
28 MiB, most of it screenshots) is committed whole. Every later milestone ports the prototype's
behaviour and compares its screenshots against the prototype's, and every later brief links into the
folder; `RULE-DOC-004` resolves those links, which would fail in CI against an untracked folder.

No gate needed reconfiguring for it (brief 0046 lists each one), but one ignore rule did: the root
`.gitignore` line `data/`, there for the Taskwarrior data root, also matched the folder's
`shared/data/`, the invented demo set every prototype imports, and a clean checkout could not load
the prototype. One negation below that line re-includes exactly that path; the line itself stays as
`RULE-HYG-002` requires it, and every other `data/` stays ignored. The fonts in the folder are SIL
OFL 1.1 and their files carry no licence text, so an `OFL.txt` goes in beside them.

## The contract step

- **M16 (switch):** the default becomes `neu`; `?ui=alt` still reaches the old UI.
- **M17 (contract)**, after at least 14 days of M16 without a fallback: the old views and components,
  `AppShell.vue`, `pick.js`, `uiFlag.js` and their tests are deleted, and `fe/app` leaves the
  `tests` unit's edges unless another test needs it; `ui` leaves `ops/surfaces/spa.json`;
  `CYCLE-001` and `CYCLE-002` leave `architecture.toml` (both resolved, and `RULE-ARCH-002` fails a
  resolved cycle left declared); the old paths and their hub entries leave the contract and the
  baseline.

## Alternatives considered

- **A long-lived branch, merged when finished** — rejected above.
- **A route prefix for the new UI** (`/neu/next`) — doubles the routes surface, and the Android app's
  Custom Tab URLs (`/next?task=<uuid>`) would reach only the old UI.
- **A build-time flag** — two bundles mean two images or two deploys, and no per-user way back.
- **A server-side preference** — a schema migration and a route for a switch that is meant to
  disappear.

## Consequences

- Until M16 nobody sees the new UI without asking for it; in M0 not even then, because both sides of
  every route are the old views. A screenshot comparison of the old UI before and after this change is
  in `docs/design/2026-10-31-unified-ui/build/m0/`.
- `RISK-TEST-004` is unchanged: the wrapper and the guard are rendering and routing and are not
  mounted (ADR 0007); the decision they call is tested in `frontend/tests/uiFlag.test.js`, and the
  route fields `pick()` returns in `frontend/tests/pick.test.js`.
- The owner approval for `architecture.toml`, `ops/structure-baseline.toml` and `.gitignore` came
  from the maintainer who also directs this change (`RISK-GOV-001`).
