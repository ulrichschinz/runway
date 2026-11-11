/**
 * The rules of the new Einstellungen page (plan M14, brief 0061), pure: what a password change
 * refuses before anything is sent, how the API key is shown while hidden, and what a role change
 * sends and says when the server refuses it.
 *
 * WHY THE MASK LIVES HERE. The key is a credential. The old settings page hid it in the key row
 * and in the "Claude verbinden" step, and showed it in plain in the Claude Desktop and curl
 * snippets. Every text that holds the key goes through `shownText` now; a component is not
 * tested, and a key on a screenshot is what this test is for.
 *
 * Message keys only (`messages.settings.de.js`), no `t()`: the page turns them into text.
 */

/** The dots that stand for the hidden part of a key. */
const DOTS = '•'.repeat(16)

/**
 * Why a password change cannot be sent, or null when it can. The server checks the current
 * password; it sets no rule for the new one, so neither does this beyond "not empty".
 *
 * @param {{current: string, next: string, confirm: string}} form
 * @returns {string|null} a message key
 */
export function passwordError({ current, next, confirm }) {
  if (!current) return 'set.pw.needCurrent'
  if (!next) return 'set.pw.needNew'
  if (next !== confirm) return 'set.pw.mismatch'
  return null
}

/**
 * The key as the API-Key row shows it while hidden: dots and its last four characters, so a person
 * with two keys can tell which one this is, and nothing a screenshot could be used with.
 *
 * @param {string|null|undefined} key
 * @returns {string} '' while the key has not loaded
 */
export function maskKey(key) {
  if (!key) return ''
  return key.length > 8 ? `${DOTS}${key.slice(-4)}` : DOTS
}

/**
 * What the page shows of a text that may hold the key (a "Claude verbinden" step, an MCP
 * snippet): the text with every occurrence of the key masked, unless the person revealed it.
 * Copying always takes the text itself; only the display is masked.
 *
 * @param {string} text
 * @param {string|null|undefined} key
 * @param {boolean} revealed
 * @returns {string}
 */
export function shownText(text, key, revealed) {
  if (revealed || !key || !text.includes(key)) return text
  return text.split(key).join(maskKey(key))
}

/**
 * The role an admin's button gives a user: the other of the two.
 *
 * @param {string} role  'admin' | 'user'
 * @returns {'admin'|'user'}
 */
export function roleAfter(role) {
  return role === 'admin' ? 'user' : 'admin'
}

/**
 * Why the server refused a role change (`PUT /admin/users/{name}/role`), as a message key.
 *
 * @param {number|undefined} status  the HTTP status, undefined without an answer
 * @returns {string}
 */
export function roleError(status) {
  if (status === 409) return 'set.admin.lastAdmin'
  if (status === 404) return 'set.admin.noUser'
  if (status == null) return 'set.offline'
  return 'set.failed'
}

/**
 * What a "Kopieren" that failed says (the clipboard missing outside a secure context, or refused).
 * It asks the person to select the text and copy it themselves; when the shown text is not the
 * text to copy, the key is masked in it, and a hand copy would take the dots (a `~/.zshenv` whose
 * key then fails every request with 401), so it says to show the key first.
 *
 * @param {string} shown  what the block shows
 * @param {string|null|undefined} copy  what "Kopieren" takes; null when it is the shown text
 * @returns {'set.copyFailed'|'set.copyFailedHidden'}
 */
export function copyFailedKey(shown, copy) {
  return copy != null && copy !== shown ? 'set.copyFailedHidden' : 'set.copyFailed'
}
