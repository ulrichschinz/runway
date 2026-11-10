/**
 * The one command table of the new UI (plan M5): every key, the scope it works in, the group
 * and the message key it is listed under. The keymap (`composables/useKeymap.js`) resolves
 * keys against it now; the `?` sheet (`shortcutSheet`) and, with M9, the palette read the same
 * rows, so a key is named and bound in exactly one place.
 *
 * Scopes: `global` (every page of the new UI), `rows` (a page with a list), `next` (Nächste),
 * `all` (Alle). A key may appear once in `global`, and once per other scope. Keys are
 * `KeyboardEvent.key` values; a two-key sequence (`g i`) is a chord. No command owns a
 * modifier: a key pressed with Ctrl, Alt or Meta is never ours (`ownsKey`).
 */

export const CHORD_MS = 900

const go = (id, second, label) => ({ id: `go.${id}`, keys: [['g', second]], scope: 'global', group: 'keys.g.lists', label })

export const COMMANDS = [
  { id: 'undo', keys: [['z']], scope: 'global', group: 'keys.g.all', label: 'keys.undo' },
  go('inbox', 'i', 'list.inbox'),
  go('next', 'n', 'list.next'),
  go('waiting', 'w', 'list.waiting'),
  go('projects', 'p', 'list.projects'),
  go('someday', 's', 'list.someday'),
  go('review', 'r', 'nav.review'),
  go('all', 'a', 'nav.all'),
  go('settings', ',', 'nav.settings'),
  { id: 'cursor.down', keys: [['j'], ['ArrowDown']], scope: 'rows', group: 'keys.g.rows', label: 'keys.move', repeats: true },
  { id: 'cursor.up', keys: [['k'], ['ArrowUp']], scope: 'rows', group: 'keys.g.rows', label: 'keys.move', repeats: true },
  { id: 'check', keys: [['x']], scope: 'rows', group: 'keys.g.rows', label: 'keys.check' },
  { id: 'plan', keys: [['t']], scope: 'rows', group: 'keys.g.rows', label: 'keys.plan' },
  { id: 'delete', keys: [['Delete'], ['Backspace']], scope: 'rows', group: 'keys.g.rows', label: 'keys.delete' },
  ...['0', '1', '2', '3', '4', '5', '6'].map((k) => ({
    id: `ctx.${k}`, keys: [[k]], scope: 'next', group: 'keys.g.rows', label: 'keys.ctx',
  })),
  { id: 'toggleDone', keys: [['d']], scope: 'all', group: 'keys.g.rows', label: 'all.showDone' },
]

/** How a key is shown in the sheet. */
const KEY_NAMES = { Delete: 'Entf', Backspace: '⌫', ArrowDown: '↓', ArrowUp: '↑' }

/**
 * Whether a key event is for the page's keymap at all: not while typing in a field or
 * inside a dialog, not during IME composition, and never with a modifier.
 *
 * @param {{key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, isComposing?: boolean,
 *   target?: {tagName?: string, isContentEditable?: boolean, closest?: Function}}} event
 */
export function ownsKey(event) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false
  const target = event.target
  if (!target) return true
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return false
  return !target.closest?.('[role="dialog"]')
}

/**
 * One key against the table.
 *
 * @param {string|null} pending the first key of a chord pressed before (within `CHORD_MS`)
 * @param {string} key `KeyboardEvent.key`
 * @param {string[]} scopes the scopes active on this page (`global` is always active)
 * @param {object[]} [table]
 * @returns {{command: string|null, pending: string|null}} a command to run, or the start of a chord
 */
export function resolveKey(pending, key, scopes, table = COMMANDS) {
  const active = table.filter((c) => c.scope === 'global' || scopes.includes(c.scope))
  const seq = pending ? [pending, key] : [key]
  const hit = active.find((c) => c.keys.some((k) => k.length === seq.length && k.every((x, i) => x === seq[i])))
  if (hit) return { command: hit.id, pending: null }
  const starts = !pending && active.some((c) => c.keys.some((k) => k.length > 1 && k[0] === key))
  return { command: null, pending: starts ? key : null }
}

/**
 * Whether a held key's auto-repeat may run the command again. Only moving the cursor repeats;
 * a held `x` or Entf must not tick off or delete one row after another (one notice, one undo).
 *
 * @param {string} command a command id
 */
export function repeatsOnHold(command, table = COMMANDS) {
  return Boolean(table.find((c) => c.id === command)?.repeats)
}

/**
 * The keyboard cursor after the visible rows changed (a chip, a filter, a write): it stays on
 * its row while that row is on screen, and is dropped otherwise, so a key never acts on a todo
 * the user cannot see (06 `visibleRowIds`).
 *
 * @param {string[]} ids the visible rows' uuids in screen order
 * @param {string|null} cursor
 * @returns {string|null}
 */
export function visibleCursor(ids, cursor) {
  return cursor && ids.includes(cursor) ? cursor : null
}

/**
 * The `?` sheet, generated from the table: groups in table order, commands sharing a label
 * on one line with all their keys.
 *
 * @returns {Array<{group: string, rows: Array<{label: string, keys: string[]}>}>} message keys and key names
 */
export function shortcutSheet(table = COMMANDS) {
  const groups = []
  for (const c of table) {
    let group = groups.find((g) => g.group === c.group)
    if (!group) groups.push((group = { group: c.group, rows: [] }))
    let row = group.rows.find((r) => r.label === c.label)
    if (!row) group.rows.push((row = { label: c.label, keys: [] }))
    for (const k of c.keys) row.keys.push(k.map((x) => KEY_NAMES[x] ?? x).join(' '))
  }
  return groups
}
