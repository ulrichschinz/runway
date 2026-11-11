/**
 * `t('key', vars)`: the one way a string of the new UI reaches the screen.
 *
 * German only in v1 (`messages.de.js`). `{name}` placeholders are replaced from `vars`;
 * a value given as a day (`{day}`, YYYY-MM-DD) is shown as `Fr 06.11.`. Array values
 * (headings, keyboard hints) come back as arrays with every string in them replaced.
 *
 * A missing key renders as the key itself, so a gap is visible rather than blank, and
 * logs an error in development builds. `frontend/tests/strings.test.js` scans the source
 * for `t('…')` literals so a missing key fails the suite before it reaches anyone.
 *
 * A page that is a chunk of its own may bring a table of its own (`addMessages`, plan M13: the
 * projects pages' `messages.projects.de.js`), so its texts do not weigh on the entry. Its keys never
 * repeat the main table's; the main table is looked up first.
 */

import { formatDay } from './dates.js'
import messages from './messages.de.js'

/** The main table, then the tables lazy pages added. */
const tables = [messages]

/** Add a lazy page's table to `t()`; adding the same table again changes nothing. */
export function addMessages(table) {
  if (!tables.includes(table)) tables.push(table)
}

const tableOf = (key) => tables.find((table) => Object.hasOwn(table, key))

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    const value = vars[name]
    if (value == null) return ''
    return name === 'day' && DAY_RE.test(value) ? formatDay(value) : String(value)
  })
}

const fillDeep = (value, vars) =>
  Array.isArray(value) ? value.map((v) => fillDeep(v, vars)) : fill(value, vars)

/**
 * @param {string} key
 * @param {Object<string, string|number>} [vars]
 * @returns {string|Array} the German text; an array for structured values
 */
export function t(key, vars) {
  const table = tableOf(key)
  if (!table) {
    if (import.meta.env?.DEV) console.error(`i18n: missing key ${key}`)
    return key
  }
  const value = table[key]
  // arrays are always copied, so a caller can never change the table
  return vars || Array.isArray(value) ? fillDeep(value, vars || {}) : value
}

/** Whether the catalogue has `key` — for an optional text built from data (a context's hint). */
export const hasText = (key) => !!tableOf(key)
