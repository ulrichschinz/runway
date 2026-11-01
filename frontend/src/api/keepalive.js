/**
 * Send one outbox op with `fetch(…, {keepalive: true})`: the request survives the page
 * that sends it, so a done or delete still inside its 6 s hold reaches the server when the
 * tab is closed or hidden (plan §6.4, brief 0049).
 *
 * Not axios: an XHR is aborted with the page. That also means the client's interceptors do
 * not run here, so the bearer token is read from storage directly and a 401 is the caller's
 * to handle (the outbox pauses the op until the next login).
 */

/** The prefix `api/client.js` uses: nginx and the Vite proxy route it to the backend. */
const API_BASE = '/api'

/**
 * @param {{method: string, path: string, body: object|null}} op
 * @returns {Promise<Response>} rejects when no response arrives
 */
export function sendKeepalive(op) {
  const headers = {}
  let token = null
  try {
    token = localStorage.getItem('token')
  } catch {
    // Storage refused: sent without a token, the server answers 401 and the op waits.
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const init = { method: op.method, keepalive: true, headers }
  if (op.body) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(op.body)
  }
  return fetch(API_BASE + op.path, init)
}
