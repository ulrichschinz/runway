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
// A password being given (login, the current password) may be longer: the previous image accepted
// up to 4096 bytes (bcrypt read 72), and an account set up then must still reach the server, which
// flags it or names the operator reset (brief 0067, R7).
export const PASSWORD_GIVEN_MAX_BYTES = 4096
// bcrypt read only this many bytes of a password.
export const BCRYPT_INPUT_BYTES = 72

const encoder = new TextEncoder()

/** @param {string} value */
export function utf8Bytes(value) {
  return encoder.encode(value ?? '').length
}

/**
 * Why `value` is not an acceptable password, or null. `isNew` (register, change) adds the
 * minimum and the 1024-byte maximum; a login has no minimum, so a password set before the rule
 * still logs in, and the 4096-byte maximum the previous image had.
 *
 * @param {string} value
 * @param {{isNew: boolean}} options
 * @returns {'pw.tooShort'|'pw.tooLong'|'pw.givenTooLong'|null}
 */
export function passwordProblem(value, { isNew }) {
  const size = utf8Bytes(value)
  if (!isNew) return size > PASSWORD_GIVEN_MAX_BYTES ? 'pw.givenTooLong' : null
  if (size > PASSWORD_MAX_BYTES) return 'pw.tooLong'
  if (size < PASSWORD_MIN_BYTES) return 'pw.tooShort'
  return null
}

/**
 * Whether `next` is `current` or shares its first 72 UTF-8 bytes. A bcrypt-era hash read only
 * those, so such a "new" password would keep whatever that hash accepted (brief 0067, R6).
 *
 * @param {string} current
 * @param {string} next
 */
export function sharesTheBcryptPrefix(current, next) {
  if (current === next) return true
  const a = encoder.encode(current ?? '').slice(0, BCRYPT_INPUT_BYTES)
  const b = encoder.encode(next ?? '').slice(0, BCRYPT_INPUT_BYTES)
  return a.length === BCRYPT_INPUT_BYTES && a.length === b.length && a.every((byte, i) => byte === b[i])
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
