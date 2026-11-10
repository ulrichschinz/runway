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
 */

import { formatDay } from './dates.js'
import messages from './messages.de.js'

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
  if (!Object.hasOwn(messages, key)) {
    if (import.meta.env?.DEV) console.error(`i18n: missing key ${key}`)
    return key
  }
  const value = messages[key]
  // arrays are always copied, so a caller can never change the table
  return vars || Array.isArray(value) ? fillDeep(value, vars || {}) : value
}
