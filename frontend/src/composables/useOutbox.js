/**
 * The write path's effects around the pure queue in `shared/outboxQueue.js` (plan §6.4,
 * brief 0049): storage, timers, requests, the keepalive flush.
 *
 * Storage is the queue. Every change re-reads the account's queue (`outbox:<accountId>`,
 * `shared/browserStorage.js`), applies one queue function and writes the result back in the
 * same synchronous step — before any request leaves — so a reload, a crash, a 401 that reloads
 * `/login` (`api/client.js`) or a second tab finds every write that is not confirmed. The queue
 * is namespaced by the account id the login and `/auth/me` name (brief 0075, ADR 0050): another
 * account never reads it, and an explicit logout removes it. A session of the previous deploy that
 * has no account bound yet keeps its queue where that deploy did (`queueKey`, the legacy key), so a
 * reload loses nothing; ops a fresh login marked `prior` there are never shown or sent from here.
 * Signed out, and when storage refuses, the queue lives in memory for this page, and the page
 * reports it (`reportPending`) so a logout asks about it too. Once an account is bound, this
 * user's ops queued in memory join its stored queue. When the binding goes (a logout), the memory
 * copy goes with it.
 *
 * Done and delete wait in a hold (`HOLD_MS`); `pagehide` and a hidden tab send every held
 * op at once with `fetch(…, {keepalive: true})` (`api/keepalive.js`).
 */

import { ref } from 'vue'
import client from '../api/client.js'
import { sendKeepalive } from '../api/keepalive.js'
import {
  ACCOUNT_BOUND, LEGACY, queueKey, readKey, readToken, readUsername, reportPending, writeKey,
} from '../shared/browserStorage.js'
import {
  alreadyApplied, begin, commit, createOp, enqueue, fail, failureOf, hold, inFlightUntil, isSendable, opsOf,
  pauseAuth, recover, restore, resume, retry, serialize, undo, verifyRequest, withOpsOf,
} from '../shared/outboxQueue.js'

/** How much later than its own tab another tab fires a held op (`schedule`). */
const FOREIGN_GRACE_MS = 2000

let seq = 0
const newId = () => `${Date.now().toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const currentUser = () => readUsername()

const hasToken = () => !!readToken()

/** Ops of this session, as against the `prior` ones a fresh login found in the legacy queue. */
const live = (list) => list.filter((op) => !op.prior)

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

  /**
   * A write was refused (a full quota, a private window that keeps no site data): until a write
   * goes through again, the copy in memory is the queue. Re-reading storage would put the last
   * queue it kept (or none) over it before every change, and nothing queued since would ever be
   * sent (brief 0062). Every change still tries to write, so a later, smaller queue reaches
   * storage and the next start and the other tabs see it.
   */
  let memoryOnly = false
  /**
   * Ops this page settled or took back since storage last took the whole queue. While writes are
   * refused they are struck from what storage still holds, so neither the next start nor another
   * tab sends a done the user took back or a capture that was already posted (review of brief 0062).
   */
  const gone = new Set()
  /** The key `all` belongs to: the bound account's queue, the legacy one (`queueKey`), or null. */
  let key = queueKey()

  /**
   * The binding changed since the last read. From no binding (memory, or the legacy queue): this
   * user's ops join the new queue (`save` writes it). Unbound, or bound to another account: the
   * memory copy belonged to the account that left, and nothing of it is kept or sent.
   */
  function rebind(next) {
    const me = currentUser()
    const carried = key === null || key === LEGACY.outbox ? live(all).filter((op) => op.user === me) : []
    key = next
    memoryOnly = false
    gone.clear()
    const text = next ? readKey(next) : null
    const stored = restore(text)
    const known = new Set(stored.map((op) => op.id))
    all = [...stored, ...carried.filter((op) => !known.has(op.id))]
  }

  function load() {
    const next = queueKey()
    if (next !== key) {
      rebind(next)
      return
    }
    if (memoryOnly || key === null) return
    const text = readKey(key)
    // undefined: storage refused, keep the copy in memory.
    if (text !== undefined) all = restore(text)
  }

  /**
   * The whole queue was refused: strike `gone` from the queue storage still holds. That write is
   * smaller than the one storage already took, so a full quota lets it through; every other op
   * there (another tab's among them) stays as it is.
   */
  function pruneStored() {
    if (!gone.size || key === null) return
    const text = readKey(key)
    // Storage keeps nothing at all: there is no stale queue to replay.
    if (text === undefined) return
    const stored = restore(text)
    const kept = stored.filter((op) => !gone.has(op.id))
    if (kept.length < stored.length) writeKey(key, serialize(kept))
  }

  function save() {
    // No account bound: nothing is written where another account, or nobody, would find it.
    if (key === null) return
    if (writeKey(key, serialize(all))) {
      memoryOnly = false
      gone.clear()
    } else {
      // Storage refused or full: the queue lives in memory for this page.
      memoryOnly = true
      pruneStored()
    }
  }

  /** Read, apply `fn` to this user's ops, write back, then send and arm what is due. */
  function mutate(fn) {
    load()
    const me = currentUser()
    const before = all
    const prior = all.filter((op) => op.prior)
    const pool = live(all)
    const mine = fn(opsOf(pool, me))
    all = [...prior, ...withOpsOf(pool, me, mine)]
    const now = new Set(all.map((op) => op.id))
    for (const op of before) if (!now.has(op.id)) gone.add(op.id)
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
    // Signed out, or the session ended: nothing goes out without a token, the ops wait (locked).
    if (!hasToken()) return
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
  // A logout asks about what only this page holds, too (storage refused, or not yet written).
  reportPending(() => all.map((op) => op.id))
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
    if (event.key !== null && event.key !== queueKey() && event.key !== key) return
    load()
    ops.value = opsOf(live(all), currentUser())
    schedule({ foreign: true })
    armRecover()
  })

  // `/auth/me` bound the session (the first load after a login or the deploy): read that queue.
  window.addEventListener(ACCOUNT_BOUND, () => {
    recoverNow()
    armRecover()
  })

  return { ops, add, hold: addHeld, undo: undoAction, retry: retryFailed, resumeAuth, flush }
}
