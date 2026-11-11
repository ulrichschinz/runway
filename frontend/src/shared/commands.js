/**
 * The one command table of the new UI (plan M5, M9): every key, the scope it works in, the group
 * and the message key it is listed under, and how the command palette offers it. The keymap
 * (`composables/useKeymap.js`) resolves keys against it, the `?` sheet (`shortcutSheet`) lists it
 * and the palette (`paletteCommands`) offers it, so a key is named and bound in exactly one place.
 *
 * Scopes: `global` (every page of the new UI), `rows` (a page with a list), `next` (Nächste),
 * `all` (Alle), `inboxPage` (the Inbox with items, either mode: `s` switches it), `inbox` (the
 * Inbox while its clarify panel is shown), `stack` (the Inbox as the card stack, no question
 * open: the trays and the card's tools, plan M10), `step` (a question of the clarify panel or the
 * stack is open: its answers), `stackStep` (a question of the stack is open: `0` and `⌫` go back
 * too) and `stepProject` (the project question: `n` for a new one). A key may appear once in
 * `global`, and once per other scope. Keys are
 * `KeyboardEvent.key` values; a two-key sequence (`g i`) is a chord. No command owns a
 * modifier: a key pressed with Ctrl, Alt or Meta is never ours (`ownsKey`) — the palette's
 * ⌘K / Ctrl+K is the palette's own (`isPaletteKey`), shown in the sheet through `sheetKeys`.
 *
 * A page lists its scopes most specific first; the first scope that binds a key wins, and
 * `global` comes last. Only the clarify panel's open question (`step`, `stepProject`) rebinds a
 * global key (`n`): while it asks, its answer keys answer and do nothing else (06).
 *
 * `pal` puts a command into the palette: `group` (`act`, `nav`, `ctx`, `look`), `label` (a
 * message key with `{v}` for the command's own label, else the label itself) and `offered` (only
 * while the page offers it: an action on the cursor row, Rückgängig while there is something to
 * take back). A command without `pal` is the palette's own business: moving the cursor (its ↑ ↓),
 * Esc (it closes), the answers of an open question, `/` and ⌘K.
 */

export const CHORD_MS = 900

const go = (id, second, label) => ({
  id: `go.${id}`, keys: [['g', second]], scope: 'global', group: 'keys.g.lists', label, pal: { group: 'nav', label: 'pal.goto' },
})
const theme = (id, label) => ({ id: `theme.${id}`, keys: [], scope: 'global', group: 'keys.g.all', label, pal: { group: 'look', label: 'pal.theme' } })
const onRow = (label) => ({ group: 'act', label, offered: true })
const tray = (to, keys, label) => ({
  id: `tray.${to}`, keys, scope: 'stack', group: 'keys.g.stack', label, pal: onRow('pal.cl'),
})

export const COMMANDS = [
  { id: 'palette', keys: [], sheetKeys: [['Mod', 'K']], scope: 'global', group: 'keys.g.all', label: 'keys.palette' },
  // `n` is "neu, hier" (03): a todo; on Projekte a project, on a project's page its next action (plan M13)
  { id: 'capture', keys: [['n']], scope: 'global', group: 'keys.g.all', label: 'keys.new', pal: { group: 'act', label: 'capture.new' } },
  { id: 'search', keys: [['/']], scope: 'global', group: 'keys.g.all', label: 'keys.search' },
  { id: 'undo', keys: [['z']], scope: 'global', group: 'keys.g.all', label: 'keys.undo', pal: { group: 'act', offered: true } },
  { id: 'shortcuts', keys: [['?']], scope: 'global', group: 'keys.g.all', label: 'keys.title', pal: { group: 'look' } },
  { id: 'retry', keys: [], scope: 'global', group: 'keys.g.all', label: 'sync.retry', pal: { group: 'act', label: 'pal.retry', offered: true } },
  theme('light', 'set.light'),
  theme('dark', 'set.dark'),
  theme('system', 'set.system'),
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
  { id: 'open', keys: [['Enter'], ['o']], scope: 'rows', group: 'keys.g.rows', label: 'keys.open', pal: onRow('pal.open') },
  { id: 'close', keys: [['Escape']], scope: 'rows', group: 'keys.g.rows', label: 'keys.close' },
  { id: 'edit', keys: [['e']], scope: 'rows', group: 'keys.g.rows', label: 'keys.edit', pal: onRow('pal.edit') },
  { id: 'check', keys: [['x']], scope: 'rows', group: 'keys.g.rows', label: 'keys.check', pal: onRow('pal.check') },
  { id: 'start', keys: [['s']], scope: 'rows', group: 'keys.g.rows', label: 'keys.start', pal: onRow('pal.start') },
  { id: 'plan', keys: [['t']], scope: 'rows', group: 'keys.g.rows', label: 'keys.plan', pal: onRow('pal.plan') },
  { id: 'delete', keys: [['Delete'], ['Backspace']], scope: 'rows', group: 'keys.g.rows', label: 'keys.delete', pal: onRow('pal.delete') },
  ...['0', '1', '2', '3', '4', '5', '6'].map((k) => ({
    id: `ctx.${k}`, keys: [[k]], scope: 'next', group: 'keys.g.rows', label: 'keys.ctx',
    pal: { group: 'ctx', label: k === '0' ? 'pal.ctxOff' : 'pal.ctx', offered: true },
  })),
  ...[['next', 'n'], ['waiting', 'w'], ['someday', 'v']].map(([list, k]) => ({
    id: `move.${list}`, keys: [['m', k]], scope: 'rows', group: 'keys.g.rows', label: 'keys.moveTo', pal: onRow('pal.move'),
  })),
  { id: 'toggleDone', keys: [['d']], scope: 'all', group: 'keys.g.rows', label: 'all.showDone', pal: { group: 'look' } },
  { id: 'clarify.next', keys: [['a']], scope: 'inbox', group: 'keys.g.inbox', label: 'keys.cl.next', pal: onRow('pal.cl') },
  { id: 'clarify.waiting', keys: [['w']], scope: 'inbox', group: 'keys.g.inbox', label: 'keys.cl.wait', pal: onRow('pal.cl') },
  { id: 'clarify.someday', keys: [['v']], scope: 'inbox', group: 'keys.g.inbox', label: 'list.someday', pal: onRow('pal.cl') },
  { id: 'clarify.project', keys: [['p']], scope: 'inbox', group: 'keys.g.inbox', label: 'keys.cl.proj', pal: onRow('pal.cl') },
  ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => ({
    id: `step.${k}`, keys: [[k]], scope: 'step', group: 'keys.g.inbox', label: 'keys.cl.answer',
  })),
  { id: 'step.back', keys: [['Escape']], scope: 'step', group: 'keys.g.inbox', label: 'keys.cl.back' },
  { id: 'step.new', keys: [['n']], scope: 'stepProject', group: 'keys.g.inbox', label: 'cl.newProject' },
  { id: 'inbox.mode', keys: [['s']], scope: 'inboxPage', group: 'keys.g.inbox', label: 'keys.cl.mode', pal: { group: 'look', offered: true } },
  tray('next', [['1']], 'keys.cl.next'),
  tray('waiting', [['2']], 'keys.cl.wait'),
  tray('someday', [['3']], 'list.someday'),
  tray('done', [['4'], ['x']], 'cl.done'),
  tray('delete', [['5'], ['Delete']], 'cl.delete'),
  { id: 'stack.project', keys: [['p']], scope: 'stack', group: 'keys.g.stack', label: 'keys.cl.proj', pal: onRow('pal.cl') },
  { id: 'stack.edit', keys: [['e']], scope: 'stack', group: 'keys.g.stack', label: 'keys.edit', pal: onRow('pal.edit') },
  { id: 'stack.skip', keys: [['ArrowRight'], ['l']], scope: 'stack', group: 'keys.g.stack', label: 'keys.stack.skip', pal: onRow('pal.skip') },
  { id: 'stack.back', keys: [['0'], ['Backspace']], scope: 'stackStep', group: 'keys.g.stack', label: 'keys.cl.back' },
]

/** The scopes that may rebind a global key while they are active (see the header). */
export const ASKING_SCOPES = ['step', 'stepProject']

/** How a key is shown in the sheet and the palette; `Mod` is ⌘ or Ctrl (`modKey`). */
const KEY_NAMES = { Enter: '⏎', Escape: 'Esc', Delete: 'Entf', Backspace: '⌫', ArrowDown: '↓', ArrowUp: '↑', ArrowRight: '→' }

const keyName = (seq, mod) => seq.map((x) => (x === 'Mod' ? mod : KEY_NAMES[x] ?? x)).join(' ')

/**
 * The palette's modifier as the keyboard names it: ⌘ on Apple devices, Ctrl elsewhere.
 *
 * @param {string} [platform] `navigator.platform` (or `userAgentData.platform`)
 */
export function modKey(platform = '') {
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl'
}

/**
 * ⌘K or Ctrl+K: opens and closes the palette, also while typing in a field.
 *
 * @param {{key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean, isComposing?: boolean}} event
 */
export function isPaletteKey(event) {
  return Boolean(event.metaKey || event.ctrlKey) && !event.isComposing && !event.altKey && !event.shiftKey
    && event.key.toLowerCase() === 'k'
}

/**
 * What ⌘K / Ctrl+K does: `toggle` the palette on a fresh press, `swallow` a held key's
 * auto-repeat (taken from the browser, which would otherwise focus its own search, but toggling
 * nothing: a held ⌘K must not flicker the palette open and shut), `null` for any other key.
 *
 * @param {{key: string, repeat?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean, isComposing?: boolean}} event
 * @returns {'toggle'|'swallow'|null}
 */
export function paletteKeyAction(event) {
  if (!isPaletteKey(event)) return null
  return event.repeat ? 'swallow' : 'toggle'
}

/**
 * The palette's key as the top line and the rail show it: `⌘K` on Apple devices, `Ctrl K`
 * elsewhere — the way the `?` sheet names it there (`keyName`), never `CtrlK`.
 *
 * @param {string} mod `modKey()`
 */
export function paletteHint(mod) {
  return mod === '⌘' ? '⌘K' : keyName(['Mod', 'K'], mod)
}

/**
 * Whether a key event is for the page's keymap at all: not while a modal (the palette, the `?`
 * sheet) is open, wherever the focus is; not while typing in a field or inside a dialog, not
 * during IME composition, never with a modifier, and not Enter or Space on a button or link.
 *
 * @param {{key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, isComposing?: boolean,
 *   target?: {tagName?: string, isContentEditable?: boolean, closest?: Function}}} event
 * @param {boolean} [modal] a modal is mounted (`useModal`): the page behind it takes no key, even
 *   when a click on the modal's text has moved the focus to `<body>`
 */
export function ownsKey(event, modal = false) {
  if (modal) return false
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
export function shortcutSheet(table = COMMANDS, mod = '⌘') {
  const groups = []
  for (const c of table) {
    const keys = c.sheetKeys ?? c.keys
    if (!keys.length) continue
    let group = groups.find((g) => g.group === c.group)
    if (!group) groups.push((group = { group: c.group, rows: [] }))
    let row = group.rows.find((r) => r.label === c.label)
    if (!row) group.rows.push((row = { label: c.label, keys: [] }))
    for (const k of keys) row.keys.push(keyName(k, mod))
  }
  return groups
}

/**
 * The palette's commands right now: the rows with `pal` whose handler is mounted, whose scope is
 * active, and — for an `offered` row — that the page offers. An offer is `true`, or the label's
 * values (`{d: 'Belege Oktober hochladen'}`), optionally with its own `label` key (Pausieren
 * instead of Starten); `false` withdraws a row that is not `offered`.
 *
 * @param {{handlers: Object<string, Function>, scopes: string[], offers: Object<string, boolean|object>}} active
 *   what the mounted keymaps hold (`activeKeymap()`)
 * @param {object[]} [table]
 * @param {string} [mod] how `Mod` is shown
 * @returns {Array<{id: string, group: string, label: string, of: string, params: object, hint: string}>}
 *   `label` is a message key filled with `{v: t(of), ...params}`; `hint` the first key, as shown
 */
export function paletteCommands({ handlers, scopes, offers }, table = COMMANDS, mod = '⌘') {
  return table.flatMap((c) => {
    if (!c.pal || !handlers[c.id] || (c.scope !== 'global' && !scopes.includes(c.scope))) return []
    const offer = offers[c.id]
    if (c.pal.offered ? !offer : offer === false) return []
    const { label, ...params } = offer && typeof offer === 'object' ? offer : {}
    const first = c.keys[0]
    return [{
      id: c.id, group: c.pal.group, label: label ?? c.pal.label ?? c.label, of: c.label, params,
      hint: first ? keyName(first, mod) : '',
    }]
  })
}
