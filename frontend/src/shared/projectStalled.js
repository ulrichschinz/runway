/**
 * Each project as the snapshot reads it (plan M13, brief 0060): whether it is stuck, and its open
 * todos by list. Pure. The store lays it over `GET /gtd/projects/overview` (`projects`), so the
 * projects pages, the margin's Projekte and the rail's ring read one answer. The projects pages'
 * own rules (order, sections, pills) are in `projectOverview.js`.
 */

import { hasTag, listOf } from './gtdRules.js'

const count = (p, field) => (Number.isFinite(p[field]) ? p[field] : 0)

/**
 * Whether nothing moves a project, read from the snapshot the way the server reads it
 * (`_is_stalled`, ADR 0039): it is **active**, it **exists** (a todo names it, or it was
 * created or planned — a name only the status table knows never counts), nothing of it is in
 * the tickler (the server's `hidden`; the snapshot does not hold those todos), and none of its
 * open todos is tagged `next` or `waiting`.
 *
 * The server's own `stalled` is a reading at the snapshot's time: a next action added a moment
 * ago, or the last one ticked off, would leave it wrong until the next refresh, and the page,
 * the rail's ring and the margin would disagree. A project created a moment ago (no counts yet)
 * is stalled until it gets a next action (03).
 *
 * @param {object} p an overview row (`name`, `status`, `explicit`, `pending`, `next`, `waiting`, `hidden`)
 * @param {object[]} open every open todo of the snapshot, unconfirmed writes applied
 */
export function projectStalled(p, open) {
  if (p.status !== 'active') return false
  const own = open.filter((t) => t.project === p.name)
  const exists = !!p.explicit || own.length > 0 || count(p, 'pending') + count(p, 'hidden') + count(p, 'waiting') > 0
  if (!exists || count(p, 'hidden') > 0) return false
  return !own.some((t) => hasTag(t, 'next') || hasTag(t, 'waiting'))
}

/**
 * The overview's rows with the snapshot's reading: `stalled` (`projectStalled`) and `counts`,
 * the project's open todos by list (`{next, waiting, someday, none}`, as its page shows them).
 */
export function withSnapshot(projects, open) {
  return projects.map((p) => {
    const counts = { next: 0, waiting: 0, someday: 0, none: 0 }
    for (const t of open) {
      if (t.project !== p.name) continue
      const list = listOf(t)
      if (list in counts) counts[list] += 1
    }
    return { ...p, stalled: projectStalled(p, open), counts }
  })
}
