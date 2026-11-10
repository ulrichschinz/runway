/**
 * How the Inbox is shown in this browser (plan M10, brief 0057; 06 `ui.inboxMode`): as the list
 * with the two-key clarify panel, or as the card stack. A browser that never chose gets the stack
 * on a touch screen (`(pointer: coarse)`) or at phone width, and the list elsewhere; "Liste ·
 * Stapel" in the Inbox head, `s` and the palette change it, and the choice is remembered here.
 *
 * The key is a literal in a `.js` file on purpose: `tools/surfaces.py` snapshots localStorage
 * keys only in that form, and `inboxMode` is in `ops/surfaces/spa.json`. Storage access is
 * guarded: a browser refusing site data gets the device default and keeps a change for the page.
 */

export const INBOX_MODES = Object.freeze(['list', 'stack'])

/**
 * @param {{coarse: boolean, phone: boolean}} device a coarse pointer, a width ≤ 760 px
 * @returns {'list'|'stack'}
 */
export function defaultInboxMode({ coarse, phone }) {
  return coarse || phone ? 'stack' : 'list'
}

/**
 * A stored value if it names a mode, else the device default.
 *
 * @param {unknown} stored
 * @param {{coarse: boolean, phone: boolean}} device
 * @returns {'list'|'stack'}
 */
export function resolveInboxMode(stored, device) {
  return INBOX_MODES.includes(stored) ? stored : defaultInboxMode(device)
}

/** @returns {'list'|'stack'} the remembered mode, or the device default */
export function readInboxMode(device) {
  let stored = null
  try {
    stored = localStorage.getItem('inboxMode')
  } catch {
    // Storage refused: the default.
  }
  return resolveInboxMode(stored, device)
}

/** Remember the mode; storage that refuses changes nothing but its persistence. */
export function writeInboxMode(mode) {
  if (!INBOX_MODES.includes(mode)) return
  try {
    localStorage.setItem('inboxMode', mode)
  } catch {
    // Storage refused: the mode holds for this page.
  }
}
