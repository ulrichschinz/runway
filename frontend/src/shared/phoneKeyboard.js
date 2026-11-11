/**
 * When the phone's on-screen keyboard counts as open (plan M15, brief 0062; m3 `PageHeader`: the
 * heading folds away and the chips step aside while the IME is up).
 *
 * The web has no IME event. Chrome on Android (since 108) and Safari shrink only the visual
 * viewport when the keyboard opens; the layout viewport keeps its height. So the keyboard is open
 * when a text field has the focus *and* the visual viewport is at least `KEYBOARD_MIN_PX` shorter
 * than the layout viewport. Focus alone is not enough: the phone Inbox focuses its capture field on
 * open, and Chrome does not raise the keyboard for a focus nobody tapped. The difference alone is
 * not enough either: pinch-zoom shrinks the visual viewport too.
 */

/** Above the URL bar's slide (about 56 px), below the smallest phone keyboard (about 260 px). */
export const KEYBOARD_MIN_PX = 120

/** Input types that take typed text (and raise a keyboard). */
const TEXT_TYPES = new Set(['text', 'search', 'email', 'password', 'url', 'tel', 'number', 'date', 'datetime-local', 'time', 'month', 'week'])

/**
 * Whether an element takes typed text: an editable text input, a textarea, contenteditable.
 *
 * @param {null|{tagName?: string, type?: string, readOnly?: boolean, disabled?: boolean, isContentEditable?: boolean}} el
 * @returns {boolean}
 */
export function isTextEntry(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = (el.tagName || '').toLowerCase()
  if (tag !== 'input' && tag !== 'textarea') return false
  if (el.readOnly || el.disabled) return false
  return tag === 'textarea' || TEXT_TYPES.has((el.type || 'text').toLowerCase())
}

/**
 * @param {{layoutHeight: number, visualHeight: null|number, entry: boolean}} state the layout
 *   viewport's height (`documentElement.clientHeight`), the visual viewport's (null where the
 *   browser has none), and whether a text field has the focus
 * @returns {boolean}
 */
export function keyboardOpen({ layoutHeight, visualHeight, entry }) {
  if (!entry || visualHeight == null || !(layoutHeight > 0)) return false
  return layoutHeight - visualHeight >= KEYBOARD_MIN_PX
}
