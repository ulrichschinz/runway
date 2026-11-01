/**
 * Keep the snapshot fresh without polling (plan §6.3, 06 build plan item 10, brief 0049).
 *
 * Nothing refreshed the lists before: a todo completed by Claude or on the phone stayed on
 * the web page until a reload (inventory 2.10). Now a tab that becomes visible, a window
 * that gets focus and a network that comes back each wake the store: failed writes are
 * retried once (`onWake`), then the snapshot is read again — at most once per
 * `REFRESH_GAP_MS`, which keeps the budget of five requests per 30 s (`mayRefresh` says
 * when the network's return may skip the wait).
 *
 * A refresh that fails keeps the rows and the time of the last good snapshot and sets
 * `offline`; the next success clears it. The time is returned as an instant; the store
 * formats "Stand hh:mm" (`dates.js` `timeOf`).
 */

import { ref } from 'vue'

export const REFRESH_GAP_MS = 30_000

/**
 * Whether a refresh may start now: never within `gap` of the last one — except when the
 * network comes back after a refresh failed (`reconnect`), because that attempt never
 * reached the server and the user is looking at an "offline" page.
 *
 * @param {number|null} lastAttemptAt when the last refresh started (ms), null for never
 * @param {number} now
 * @param {{gap?: number, reconnect?: boolean}} [options]
 */
export function mayRefresh(lastAttemptAt, now, { gap = REFRESH_GAP_MS, reconnect = false } = {}) {
  return reconnect || lastAttemptAt == null || now - lastAttemptAt >= gap
}

/**
 * The freshness after a refresh: a success moves the Stand and clears `offline`; a
 * failure keeps the Stand and sets `offline`.
 *
 * @param {{at: number|null, offline: boolean}} state
 * @param {{ok: boolean, at: number}} outcome `at`: when the successful refresh started
 */
export function afterRefresh(state, { ok, at }) {
  return ok ? { at, offline: false } : { at: state.at, offline: true }
}

/**
 * @param {(startedAt: number) => Promise<void>} refresh reads the snapshot; rejects on failure
 * @param {{onWake?: () => void}} [hooks] runs on every wake, before the throttled refresh
 * @returns {{at: import('vue').Ref<number|null>, offline: import('vue').Ref<boolean>,
 *   refresh: (options?: {force?: boolean, reconnect?: boolean}) => Promise<void>}}
 */
export function useFreshness(refresh, { onWake = () => {} } = {}) {
  const at = ref(null)
  const offline = ref(false)
  let lastAttemptAt = null
  let running = null

  function run({ force = false, reconnect = false } = {}) {
    if (running) return running
    const now = Date.now()
    if (!force && !mayRefresh(lastAttemptAt, now, { reconnect })) return Promise.resolve()
    lastAttemptAt = now
    running = refresh(now)
      .then(
        () => afterRefresh({ at: at.value }, { ok: true, at: now }),
        () => afterRefresh({ at: at.value }, { ok: false, at: now }),
      )
      .then((state) => {
        at.value = state.at
        offline.value = state.offline
        running = null
      })
    return running
  }

  const wake = (event) => {
    onWake()
    run({ reconnect: event?.type === 'online' && offline.value })
  }
  window.addEventListener('focus', wake)
  window.addEventListener('online', wake)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake()
  })

  return { at, offline, refresh: run }
}
