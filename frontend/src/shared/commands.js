/**
 * The one command table of the new UI (plan M5): every key, the scope it works in, the group
 * and the message key it is listed under. The keymap (`composables/useKeymap.js`) resolves
 * keys against it now; the `?` sheet (`shortcutSheet`) and, with M9, the palette read the same
 * rows, so a key is named and bound in exactly one place.
 *
 * Scopes: `global` (every page of the new UI), `rows` (a page with a list), `next` (Nächste),
 * `all` (Alle), `inbox` (the Inbox while its clarify panel is shown), `step` (a question of
 * the clarify panel is open: its answers) and `stepProject` (the project question: `n` for a new
 * one). A key may appear once in `global`, and once per other scope. Keys are
 * `KeyboardEvent.key` values; a two-key sequence (`g i`) is a chord. No command owns a
 * modifier: a key pressed with Ctrl, Alt or Meta is never ours (`ownsKey`).
 *
 * A page lists its scopes most specific first; the first scope that binds a key wins, and
 * `global` comes last. Only the clarify panel's open question (`step`, `stepProject`) rebinds a
 * global key (`n`): while it asks, its answer keys answer and do nothing else (06).
 */

export const CHORD_MS = 900

const go = (id, second, label) => ({ id: `go.${id}`, keys: [['g', second]], scope: 'global', group: 'keys.g.lists', label })

export const COMMANDS = [
  { id: 'undo', keys: [['z']], scope: 'global', group: 'keys.g.all', label: 'keys.undo' },
  { id: 'capture', keys: [['n']], scope: 'global', group: 'keys.g.all', label: 'capture.new' },
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
  { id: 'open', keys: [['Enter'], ['o']], scope: 'rows', group: 'keys.g.rows', label: 'keys.open' },
  { id: 'close', keys: [['Escape']], scope: 'rows', group: 'keys.g.rows', label: 'keys.close' },
  { id: 'edit', keys: [['e']], scope: 'rows', group: 'keys.g.rows', label: 'keys.edit' },
  { id: 'check', keys: [['x']], scope: 'rows', group: 'keys.g.rows', label: 'keys.check' },
  { id: 'start', keys: [['s']], scope: 'rows', group: 'keys.g.rows', label: 'keys.start' },
  { id: 'plan', keys: [['t']], scope: 'rows', group: 'keys.g.rows', label: 'keys.plan' },
  { id: 'delete', keys: [['Delete'], ['Backspace']], scope: 'rows', group: 'keys.g.rows', label: 'keys.delete' },
  ...['0', '1', '2', '3', '4', '5', '6'].map((k) => ({
    id: `ctx.${k}`, keys: [[k]], scope: 'next', group: 'keys.g.rows', label: 'keys.ctx',
  })),
  ...[['next', 'n'], ['waiting', 'w'], ['someday', 'v']].map(([list, k]) => ({
    id: `move.${list}`, keys: [['m', k]], scope: 'rows', group: 'keys.g.rows', label: 'keys.moveTo',
  })),
  { id: 'toggleDone', keys: [['d']], scope: 'all', group: 'keys.g.rows', label: 'all.showDone' },
  { id: 'clarify.next', keys: [['a']], scope: 'inbox', group: 'keys.g.inbox', label: 'keys.cl.next' },
  { id: 'clarify.waiting', keys: [['w']], scope: 'inbox', group: 'keys.g.inbox', label: 'keys.cl.wait' },
  { id: 'clarify.someday', keys: [['v']], scope: 'inbox', group: 'keys.g.inbox', label: 'list.someday' },
  { id: 'clarify.project', keys: [['p']], scope: 'inbox', group: 'keys.g.inbox', label: 'keys.cl.proj' },
  ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => ({
    id: `step.${k}`, keys: [[k]], scope: 'step', group: 'keys.g.inbox', label: 'keys.cl.answer',
  })),
  { id: 'step.back', keys: [['Escape']], scope: 'step', group: 'keys.g.inbox', label: 'keys.cl.back' },
  { id: 'step.new', keys: [['n']], scope: 'stepProject', group: 'keys.g.inbox', label: 'cl.newProject' },
]

/** The scopes that may rebind a global key while they are active (see the header). */
export const ASKING_SCOPES = ['step', 'stepProject']

/** How a key is shown in the sheet. */
const KEY_NAMES = { Enter: '⏎', Escape: 'Esc', Delete: 'Entf', Backspace: '⌫', ArrowDown: '↓', ArrowUp: '↑' }

/**
 * Whether a key event is for the page's keymap at all: not while typing in a field or
 * inside a dialog, not during IME composition, never with a modifier, and not Enter or Space
 * on a button or link.
 *
 * @param {{key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, isComposing?: boolean,
 *   target?: {tagName?: string, isContentEditable?: boolean, closest?: Function}}} event
 */
export function ownsKey(event) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false
  const target = event.target
  if (!target) return true
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return false
  // Enter and Space on a button or link are that control's own click.
  if (['BUTTON', 'A'].includes(target.tagName) && (event.key === 'Enter' || event.key === ' ')) return false
  return !target.closest?.('[role="dialog"]')
}

/**
 * One key against the table.
 *
 * @param {string|null} pending the first key of a chord pressed before (within `CHORD_MS`)
 * @param {string} key `KeyboardEvent.key`
 * @param {string[]} scopes the scopes active on this page, most specific first (`global` is
 *   always active, and last)
 * @param {object[]} [table]
 * @returns {{command: string|null, pending: string|null}} a command to run, or the start of a chord
 */
export function resolveKey(pending, key, scopes, table = COMMANDS) {
  const rank = (c) => (c.scope === 'global' ? scopes.length : scopes.indexOf(c.scope))
  const active = table.filter((c) => rank(c) >= 0).sort((a, b) => rank(a) - rank(b))
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
