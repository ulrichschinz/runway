/**
 * The new UI's navigation: which views the rail lists, which ones the phone dock has as tabs,
 * and what the "Mehr" sheet holds (06 rail, m3 dock; brief 0050). Rail, dock and sheet read
 * these lists, so a view is named, ordered and routed in one place.
 *
 * `key` is the view (`meta.view` on the route), `to` its path, `label` its message key.
 */

/** The lists, in the rail's order (06). */
export const LISTS = [
  { key: 'inbox', to: '/inbox', label: 'list.inbox' },
  { key: 'next', to: '/next', label: 'list.next' },
  { key: 'waiting', to: '/waiting', label: 'list.waiting' },
  { key: 'projects', to: '/projects', label: 'list.projects' },
  { key: 'someday', to: '/someday', label: 'list.someday' },
]

/** Below the lists in the rail, after a gap. */
export const PLACES = [
  { key: 'review', to: '/review', label: 'nav.review' },
  { key: 'all', to: '/all', label: 'nav.all' },
  { key: 'settings', to: '/settings', label: 'nav.settings' },
]

const DOCK_KEYS = ['inbox', 'next', 'waiting']

/** The phone dock's three tabs (m3); everything else is behind "···". */
export const DOCK_TABS = LISTS.filter((item) => DOCK_KEYS.includes(item.key))

/** What the "Mehr" sheet lists: every view that is not a tab. */
export const MORE_ITEMS = [...LISTS, ...PLACES].filter((item) => !DOCK_KEYS.includes(item.key))

/**
 * The rail entry a view belongs to: a project's page belongs to Projekte.
 *
 * @param {string|undefined} view
 * @returns {string|null}
 */
export function navKeyOf(view) {
  if (view === 'project') return 'projects'
  return [...LISTS, ...PLACES].some((item) => item.key === view) ? view : null
}

/**
 * The dock tab a view belongs to: one of the three tabs, else `more` ("···").
 *
 * @param {string|undefined} view
 * @returns {'inbox'|'next'|'waiting'|'more'}
 */
export function dockKeyOf(view) {
  return DOCK_KEYS.includes(view) ? view : 'more'
}
