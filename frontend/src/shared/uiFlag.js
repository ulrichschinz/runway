/**
 * Which of the two UIs this browser renders: the old one (`alt`) or the new one (`neu`).
 *
 * WHY THIS EXISTS. The new UI was built milestone by milestone behind this switch, because every
 * merge deploys (ADR 0042): any URL with `?ui=neu` or `?ui=alt` stores the choice in this browser,
 * and every route renders the side the choice names. Since M16 (brief 0063) a browser with no
 * valid choice renders the new UI; `?ui=alt` still reaches the old one, and a browser that stored
 * `alt` keeps it, until M17 removes the old UI and this switch with it.
 *
 * The key is written as a literal on purpose: `tools/surfaces.py` snapshots localStorage keys
 * only in that form, and `ui` is a public surface until the switch is removed. Storage access
 * is guarded because a browser may refuse site data; it then renders the default, or the
 * query's choice for that one page load.
 */

const UI_OLD = 'alt'
export const UI_NEW = 'neu'

/** What a browser that never chose renders: the new UI since M16 (brief 0063). */
export const UI_DEFAULT = UI_NEW

/**
 * The UI a raw value names, or null when it names none. Only the exact words count: a
 * repeated query parameter arrives as an array and is ignored like any other noise.
 *
 * @param {unknown} value  a query parameter or a stored value
 * @returns {'alt'|'neu'|null}
 */
export function parseUi(value) {
  return value === UI_OLD || value === UI_NEW ? value : null
}

/**
 * A valid choice in the query wins over the stored one, which wins over the default.
 *
 * @param {unknown} queryValue   the `ui` query parameter of the current route
 * @param {unknown} storedValue  what `localStorage['ui']` holds
 * @returns {'alt'|'neu'}
 */
export function resolveUi(queryValue, storedValue) {
  return parseUi(queryValue) ?? parseUi(storedValue) ?? UI_DEFAULT
}

/** @returns {string|null} the stored choice, or null when there is none or storage refuses */
function storedUi() {
  try {
    return localStorage.getItem('ui')
  } catch {
    return null
  }
}

/**
 * The UI to render for a route with this `ui` query parameter.
 *
 * @param {unknown} queryValue
 * @returns {'alt'|'neu'}
 */
export function currentUi(queryValue) {
  return resolveUi(queryValue, storedUi())
}

/**
 * Store the choice a `?ui=` value names. Anything that names no UI leaves the stored choice
 * as it is, and storage that refuses the write changes nothing but its persistence.
 *
 * @param {unknown} queryValue
 */
export function rememberUi(queryValue) {
  const ui = parseUi(queryValue)
  if (!ui) return
  try {
    localStorage.setItem('ui', ui)
  } catch {
    // Storage refused: the query still applies to this page load through currentUi().
  }
}
