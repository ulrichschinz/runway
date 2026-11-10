/**
 * Where a login returns to, and which todo a link opens (plan F19, brief 0050).
 *
 * WHY THIS EXISTS. Android opens `/next?task=<uuid>` in a Custom Tab; without a session the
 * router sends that visit to `/login`, and after the login the person must land where the link
 * pointed, with the todo open. The return path travels in the address bar (`/login?next=…`), so
 * anyone can write one: a `next` that leaves this origin would make the login page an open
 * redirect. Only a relative path on this origin is followed; anything else returns to `/`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/
const BASE = 'http://runway.invalid'

/**
 * The path a `next` query value names, or null when it is not a same-origin relative path.
 * A path back to the login page is refused too, so a login never returns to itself.
 *
 * @param {unknown} value  the `next` query parameter (a repeated one arrives as an array)
 * @returns {string|null}  path, query and hash, as given
 */
export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return null
  // `//host` and `/\host` are protocol-relative to a browser; control characters can hide either.
  if (value.startsWith('//') || value.includes('\\') || CONTROL_RE.test(value)) return null
  let url
  try {
    url = new URL(value, BASE)
  } catch {
    return null
  }
  if (url.origin !== BASE) return null
  if (url.pathname === '/login') return null
  return value
}

/**
 * The todo a `?task=` value names, lower-cased, or null when it is not a uuid.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function taskParam(value) {
  return typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null
}

/**
 * Where the router sends a visit that needs a session: the login page, carrying the visited
 * path when there is one worth returning to.
 *
 * @param {string} fullPath  the visited route's full path (path, query, hash)
 * @returns {{path: string, query?: {next: string}}}
 */
export function loginRedirect(fullPath) {
  const next = safeNext(fullPath)
  return next && next !== '/' ? { path: '/login', query: { next } } : { path: '/login' }
}

/**
 * The login URL a full page load goes to when the API ends the session (a 401 on a stale token):
 * the same `next` rule as the router guard, so a Custom Tab link survives an expired session too.
 *
 * @param {string} fullPath  `location.pathname + location.search + location.hash`
 * @returns {string}  `/login` or `/login?next=<encoded path>`
 */
export function loginHref(fullPath) {
  const r = loginRedirect(fullPath)
  return r.query ? `/login?next=${encodeURIComponent(r.query.next)}` : '/login'
}
