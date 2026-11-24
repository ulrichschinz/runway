/**
 * The server's password rule (finding SEC-006, ADR 0044 Decision 5, brief 0067), pure, so a form
 * can say why before anything is sent. Counted in UTF-8 bytes, as the server counts: what a hash
 * reads is bytes, and 'ä' is two of them. The server stays the authority — it answers 422 for a
 * password outside the rule whatever this says.
 *
 * Message keys without a table prefix ('pw.tooShort'): each page puts its own in front.
 */

export const PASSWORD_MIN_BYTES = 8
export const PASSWORD_MAX_BYTES = 1024

const encoder = new TextEncoder()

/** @param {string} value */
export function utf8Bytes(value) {
  return encoder.encode(value ?? '').length
}

/**
 * Why `value` is not an acceptable password, or null. `isNew` (register, change) adds the
 * minimum; a login has none, so a password set before the rule still logs in.
 *
 * @param {string} value
 * @param {{isNew: boolean}} options
 * @returns {'pw.tooShort'|'pw.tooLong'|null}
 */
export function passwordProblem(value, { isNew }) {
  const size = utf8Bytes(value)
  if (size > PASSWORD_MAX_BYTES) return 'pw.tooLong'
  if (isNew && size < PASSWORD_MIN_BYTES) return 'pw.tooShort'
  return null
}

/**
 * Where a successful login goes. A login the server accepted through a bcrypt-era hash for a
 * password of 72 bytes or more says `password_change_required`: that hash cannot be upgraded from
 * what was typed, so the person is sent to set a new password before the window closes.
 *
 * @param {{password_change_required?: boolean}|undefined} answer  the login's response body
 * @param {string|null|undefined} next  the safe return path, if any
 */
export function landingAfterLogin(answer, next) {
  if (answer?.password_change_required) return '/settings?password=change'
  return next ?? '/'
}
