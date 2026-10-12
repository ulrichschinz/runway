/**
 * Whether a failed API call means the stored session is over.
 *
 * WHY THIS EXISTS. The API client used to treat every 401 as "the session expired": drop
 * the token and reload `/login`. But `POST /auth/login` answers 401 too — "Invalid
 * credentials" — so a mistyped password reloaded the login page before its message could be
 * rendered. The form came back empty and silent, which reads as "login throws me back to
 * login" rather than as "wrong password". The rule is pure, so it lives here and is tested;
 * the client only calls it.
 *
 * A 401 ends the session only when the request carried the session token and was not the
 * login itself: without a token there is no session to end, and a refused login is an
 * answer for the form, not a verdict on a token it never used.
 */

/** The one route whose 401 is about the credentials in its body. */
const LOGIN_PATH = '/auth/login'

/**
 * @param {object} error  the rejection an axios response interceptor receives
 * @returns {boolean} true when the token should be dropped and the login page shown
 */
export function endsSession(error) {
  if (error?.response?.status !== 401) return false
  const config = error.config
  if (!config?.headers?.Authorization) return false
  return config.url !== LOGIN_PATH
}
