/**
 * The write path's effects around the pure queue in `shared/outboxQueue.js` (plan §6.4,
 * brief 0049): storage, timers, requests, the keepalive flush.
 *
 * Storage is the queue. Every change re-reads `localStorage['outbox']`, applies one queue
 * function and writes the result back in the same synchronous step — before any request
 * leaves — so a reload, a crash, a 401 that reloads `/login` (`api/client.js`) or a second
 * tab finds every write that is not confirmed. Ops belong to the user who made them
 * (`username`); another user's ops are kept as they are and never sent. When storage
 * refuses, the queue lives in memory for this page.
 *
 * Done and delete wait in a hold (`HOLD_MS`); `pagehide` and a hidden tab send every held
 * op at once with `fetch(…, {keepalive: true})` (`api/keepalive.js`).
 */

import { ref } from 'vue'
import client from '../api/client.js'
import { sendKeepalive } from '../api/keepalive.js'
import {
  alreadyApplied, begin, commit, createOp, enqueue, fail, failureOf, hold, inFlightUntil, isSendable, opsOf,
  pauseAuth, recover, restore, resume, retry, serialize, undo, verifyRequest, withOpsOf,
} from '../shared/outboxQueue.js'

/** How much later than its own tab another tab fires a held op (`schedule`). */
const FOREIGN_GRACE_MS = 2000

let seq = 0
const newId = () => `${Date.now().toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function currentUser() {
  try {
    return localStorage.getItem('username')
  } catch {
    return null
  }
}

function hasToken() {
  try {
    return !!localStorage.getItem('token')
  } catch {
    return false
  }
}

/** The server's reason for refusing a request (FastAPI's `detail`), or ''. */
function messageOf(err) {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d?.msg).filter(Boolean).join('; ')
  return ''
}

/**
 * GET for a verification. `GET /tasks/{uuid}` answers 400 "Task not found" for a task that
 * does not exist: that is an answer (null), not a failure.
 */
async function read({ path, params }) {
  try {
    return (await client.get(path, { params })).data
  } catch (err) {
    if (err?.response?.status === 400 && path.startsWith('/tasks/')) return null
    throw err
  }
}

/**
 * @param {object} hooks
 * @param {(op: object, reply: *) => void} hooks.onSettled the server applied `op` (for a
 *   capture, `op.uuid` is the server's); `reply` is the response body
 * @param {(op: object, reason: string, message: string) => void} [hooks.onFailed]
 */
export function useOutbox({ onSettled, onFailed = () => {} }) {
  /** This user's ops, for the store's overlay and the views. */
  const ops = ref([])
  /** Every user's ops as last read or written. */
  let all = []
  const timers = new Map()
  /** This page's mark on the ops it puts in flight, so another tab's `recover` leaves them be. */
  const tab = newId()

  function load() {
    try {
      all = restore(localStorage.getItem('outbox'))
    } catch {
      // Storage refused: keep the copy in memory.
    }
  }

  function save() {
    try {
      localStorage.setItem('outbox', serialize(all))
    } catch {
      // Storage refused or full: the queue lives in memory for this page.
    }
  }

  /** Read, apply `fn` to this user's ops, write back, then send and arm what is due. */
  function mutate(fn) {
    load()
    const me = currentUser()
    const mine = fn(opsOf(all, me))
    all = withOpsOf(all, me, mine)
    save()
    ops.value = mine
    schedule()
  }

  /**
   * Send what is queued; arm a timer per hold; disarm timers whose hold is gone.
   *
   * `foreign`: the change came from another tab. That tab sends what it queued itself, so
   * nothing queued is sent from here: the other tab's later write (`sending`) can reach this
   * tab's storage after its event, and a capture would be posted twice. Its holds are armed
   * `FOREIGN_GRACE_MS` late, as a backup should that tab be gone by then.
   */
  function schedule({ foreign = false } = {}) {
    const now = Date.now()
    for (const op of ops.value) {
      if (op.state === 'queued' && !foreign) queueMicrotask(() => send(op.id))
      else if (op.state === 'held' && !timers.has(op.id)) {
        timers.set(op.id, setTimeout(() => {
          timers.delete(op.id)
          send(op.id)
        }, Math.max(0, op.until - now) + (foreign ? FOREIGN_GRACE_MS : 0)))
      }
    }
    for (const [id, timer] of timers) {
      if (!ops.value.some((op) => op.id === id && op.state === 'held')) {
        clearTimeout(timer)
        timers.delete(id)
      }
    }
  }

  function settle(op, reply) {
    let result
    mutate((list) => {
      result = commit(list, op.id, reply, { newId: newId(), now: Date.now() })
      return result.ops
    })
    onSettled(result.settled ?? op, reply)
  }

  function failed(op, status, message) {
    const reason = failureOf(status)
    mutate((list) => (reason === 'auth' ? pauseAuth(list, op.id) : fail(list, op.id, { reason, message })))
    onFailed(op, reason, message)
  }

  async function send(id) {
    let op = null
    mutate((list) => {
      const current = list.find((o) => o.id === id)
      if (!isSendable(current)) return list
      op = current
      return begin(list, id, { now: Date.now(), tab })
    })
    if (!op) return
    if (!hasToken()) {
      mutate((list) => pauseAuth(list, id))
      return
    }
    try {
      const check = verifyRequest(op)
      if (check) {
        const reply = alreadyApplied(op, await read(check))
        if (reply) {
          settle(op, reply)
          return
        }
      }
      const { data } = await client.request({ method: op.method, url: op.path, data: op.body ?? undefined })
      settle(op, data)
    } catch (err) {
      failed(op, err?.response?.status, messageOf(err))
    }
  }

  /**
   * The page goes away or out of sight: send every held op, and every queued one that needs
   * no duplicate check (a capture made as the page goes away), with keepalive, so it
   * survives the page. An op that must be verified first waits for the next start.
   */
  function flush() {
    let flushing = []
    mutate((list) => {
      flushing = list.filter((op) => op.state === 'held' || (op.state === 'queued' && !op.verify))
      return flushing.reduce((acc, op) => begin(acc, op.id, { now: Date.now(), tab, keepalive: true }), list)
    })
    for (const op of flushing) {
      sendKeepalive(op)
        .then(async (res) => (res.ok ? settle(op, await res.json().catch(() => null)) : failed(op, res.status, '')))
        .catch(() => failed(op, undefined, ''))
    }
  }

  const meta = () => ({ id: newId(), at: Date.now(), user: currentUser() })

  /** Send a write now. @returns {object} the op, for Rückgängig */
  function add(kind, fields) {
    const op = createOp(kind, fields, meta())
    mutate((list) => enqueue(list, op))
    return op
  }

  /** Hold a done or delete for `HOLD_MS`. @returns {object} the op, for Rückgängig */
  function addHeld(kind, fields) {
    const op = createOp(kind, fields, meta())
    mutate((list) => hold(list, op, Date.now()))
    return op
  }

  /** @returns {boolean} false when it is too late to take the action back */
  function undoAction(action) {
    let undone = false
    mutate((list) => {
      const result = undo(list, action, { newId: newId(), now: Date.now() })
      undone = result.undone
      return result.ops
    })
    return undone
  }

  /** "Erneut senden" (`id`, or every failed op), or an automatic retry (`auto`). */
  function retryFailed(options) {
    mutate((list) => retry(list, options))
  }

  /** After a login in this page's life: paused ops go out again. */
  function resumeAuth() {
    if (hasToken() && ops.value.some((op) => op.state === 'auth')) mutate((list) => resume(list, Date.now()))
  }

  load()
  const recoverNow = () => mutate((list) => recover(list, Date.now(), { authed: hasToken(), tab }))
  // Ops another tab has in flight are left to it; once their window has passed, they are
  // taken over (that tab was closed or its request was lost). Armed at boot and whenever
  // another tab's write shows one, so a closed tab's op is not left until the next reload.
  let recoverTimer = null
  let recoverAt = Infinity
  function armRecover() {
    const due = Math.min(...ops.value
      .filter((op) => op.state === 'sending' && op.tab !== tab && op.sentAt)
      .map((op) => inFlightUntil(op) + 1000))
    if (due >= recoverAt) return
    clearTimeout(recoverTimer)
    recoverAt = due
    recoverTimer = setTimeout(() => {
      recoverAt = Infinity
      recoverNow()
      armRecover()
    }, Math.max(0, due - Date.now()))
  }
  recoverNow()
  armRecover()
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  // Another tab changed the queue: show it, and arm its holds here too, late (`schedule`).
  window.addEventListener('storage', (event) => {
    if (event.key !== 'outbox') return
    load()
    ops.value = opsOf(all, currentUser())
    schedule({ foreign: true })
    armRecover()
  })

  return { ops, add, hold: addHeld, undo: undoAction, retry: retryFailed, resumeAuth, flush }
}
