/**
 * The projects as the new UI shows them (plan M13, brief 0060; 06 `store.projectOverview`,
 * `renderProjects`, `sectionsFor('project')`). Pure: the rows of `GET /gtd/projects/overview`
 * with the outbox laid over them, and the snapshot's open todos.
 *
 * Names are read exactly, as the server's `project_rollup` counts them: `home.garden` is a
 * project of its own, not a part of `home`.
 */

// The snapshot's reading of each project (`stalled`, `counts`) is in `projectStalled.js`: the store
// needs it on every page, these rules only the projects pages (the entry budget, brief 0060).

/** The statuses the API stores (`PUT /projects/{name}/status`), in the overview's order. */
export const PROJECT_STATUSES = ['active', 'on_hold', 'done']

const byName = (a, b) => a.name.localeCompare(b.name, 'de')

/**
 * Projekte's three sections (06 `renderProjects`): Aktiv with the stalled ones first, then Ruht,
 * then Abgeschlossen; by name in German order within each. A status the API does not know reads
 * as active, as the server reads a project without one.
 *
 * @returns {{active: object[], on_hold: object[], done: object[]}}
 */
export function overviewSections(projects) {
  const out = { active: [], on_hold: [], done: [] }
  for (const p of projects) (out[p.status] ?? out.active).push(p)
  out.active.sort((a, b) => Number(!!b.stalled) - Number(!!a.stalled) || byName(a, b))
  out.on_hold.sort(byName)
  out.done.sort(byName)
  return out
}

/** The head's numbers: active projects, and how many of them are stalled. */
export function overviewCounts(projects) {
  const active = projects.filter((p) => !PROJECT_STATUSES.includes(p.status) || p.status === 'active')
  return { active: active.length, stalled: active.filter((p) => p.stalled).length }
}

/**
 * What a project's state reads as: `stalled`, else its status (06: "steckt fest", "aktiv",
 * "ruht", "abgeschlossen").
 */
export const projectState = (p) => (p.stalled ? 'stalled' : PROJECT_STATUSES.includes(p.status) ? p.status : 'active')

/**
 * The status pills a project offers (06 `renderHead('project')`): an active one can rest or be
 * finished, a resting one resumed or finished, a finished one resumed.
 *
 * @returns {string[]} the statuses to offer, in 06's order
 */
export function statusChoices(status) {
  if (status === 'on_hold') return ['active', 'done']
  if (status === 'done') return ['active']
  return ['on_hold', 'done']
}

/**
 * A project's page (06 `sectionsFor('project')`): its todos from the store's lists, which are
 * already sorted, so each section keeps its list's order. A todo tagged both `next` and
 * `waiting` is in Warten auf only (F4), as everywhere.
 *
 * @param {{next: object[], waiting: object[], someday: object[], unlisted: object[]}} lists
 * @param {string} name
 * @returns {{next: object[], waiting: object[], someday: object[], none: object[]}}
 */
export function projectSections(lists, name) {
  const of = (tasks) => tasks.filter((t) => t.project === name)
  return { next: of(lists.next), waiting: of(lists.waiting), someday: of(lists.someday), none: of(lists.unlisted) }
}
