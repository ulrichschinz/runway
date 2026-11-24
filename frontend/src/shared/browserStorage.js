/**
 * Every key this app keeps in the browser, and the only code that touches `localStorage`
 * (brief 0075, ADR 0047; finding REV-006, RISK-SEC-001).
 *
 * WHY THIS EXISTS. A browser profile can be shared — a family laptop, a workstation — and before
 * this module a logout removed the token and the profile, but left the offline queue (task text)
 * and the capture draft behind for the next person, guarded only by a username filter that decided
 * what was *shown*, not what was *kept*. Storage calls were spread over a dozen files, so no one
 * place knew what a logout had to remove. Now:
 *
 * - every key is declared below with its data class (by `declareKey`); `tools/surfaces.py` reads the
 *   declarations into `ops/surfaces/spa.json`, and `readKey`/`writeKey`/`removeKey` refuse any name
 *   the inventory does not declare, so a new key cannot appear without a snapshot diff;
 * - account data lives under `<key>:<accountId>`, where the id is `users.id` from `GET /auth/me`
 *   (`account_id`) — stable, never reused, unlike a username that can be registered again;
 * - an explicit logout (`signOut`) asks before discarding unsent changes and then removes the
 *   account's data; only UI preferences stay;
 * - a session that merely ends (a 401, `lockSession`) removes the token and nothing else: the
 *   namespace waits, locked, for the same account to sign in again (decision D6).
 *
 * Every access is guarded: a private window or a full quota refuses, and the app must keep
 * working on what it has in memory. `frontend/tests/browserStorage.test.js` holds the rules and,
 * by a source scan, that no other file touches storage.
 */

import { restore, serialize } from './outboxQueue.js'

/** What a key holds, which decides whether a logout removes it. */
export const CLASS = Object.freeze({
  CREDENTIAL: 'credential',
  IDENTITY: 'identity',
  OUTBOX: 'outbox',
  DRAFT: 'draft',
  PREFERENCE: 'preference',
  LEGACY: 'legacy',
})

const declared = []

/**
 * Declare a key. The name is a literal on purpose: `tools/surfaces.py` snapshots the
 * first argument of every declareKey call (S8). `{account}` marks a per-account key.
 */
function declareKey(name, dataClass) {
  declared.push(Object.freeze({ name, dataClass, accountBound: dataClass !== CLASS.PREFERENCE }))
  return name
}

/** The keys this version reads and writes. */
export const KEY = Object.freeze({
  token: declareKey('token', CLASS.CREDENTIAL),
  username: declareKey('username', CLASS.IDENTITY),
  accountId: declareKey('accountId', CLASS.IDENTITY),
  outbox: declareKey('outbox:{account}', CLASS.OUTBOX),
  draft: declareKey('captureDraft:{account}', CLASS.DRAFT),
  theme: declareKey('theme', CLASS.PREFERENCE),
  ui: declareKey('ui', CLASS.PREFERENCE),
  inboxMode: declareKey('inboxMode', CLASS.PREFERENCE),
})

/**
 * Keys the previous versions wrote and this one only reads once to migrate, then removes
 * (`SHIM-FE-001` in `rules/shims.yaml`: the contract step deletes them from here).
 */
export const LEGACY = Object.freeze({
  outbox: declareKey('outbox', CLASS.LEGACY),
  draft: declareKey('captureDraft', CLASS.LEGACY),
  role: declareKey('role', CLASS.LEGACY),
  fullName: declareKey('fullName', CLASS.LEGACY),
  email: declareKey('email', CLASS.LEGACY),
})

/** Every declared key, for the tests and for anyone asking what the browser holds. */
export const INVENTORY = Object.freeze([...declared])

/** An account id fit to be part of a key: what `GET /auth/me` sends, nothing a path or `:` can hide in. */
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/

const FIXED = new Set(INVENTORY.filter((k) => !k.name.includes('{account}')).map((k) => k.name))
const PER_ACCOUNT = INVENTORY.filter((k) => k.name.includes('{account}')).map((k) => k.name.split('{account}')[0])

/**
 * Whether `name` is a declared key, or a per-account template filled with a well-formed id.
 * Everything else is refused, so no module can keep data the inventory — and the logout — does
 * not know of (review of brief 0075).
 */
export function isDeclared(name) {
  if (typeof name !== 'string') return false
  if (FIXED.has(name)) return true
  return PER_ACCOUNT.some((prefix) => name.startsWith(prefix) && ACCOUNT_ID.test(name.slice(prefix.length)))
}

/** The browser's storage, or null where even reaching it throws (a sandboxed frame). */
function browser(storage) {
  if (storage !== undefined) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * @param {string} name
 * @param {Storage|null} [storage] the browser's `localStorage` when left out
 * @returns {string|null|undefined} the value; null when absent; undefined when storage refused
 */
export function readKey(name, storage) {
  if (!isDeclared(name)) return undefined
  const s = browser(storage)
  if (!s) return undefined
  try {
    return s.getItem(name)
  } catch {
    return undefined
  }
}

/** @returns {boolean} false when storage refused the write, or the key is not declared */
export function writeKey(name, value, storage) {
  if (!isDeclared(name)) return false
  const s = browser(storage)
  if (!s) return false
  try {
    s.setItem(name, value)
    return true
  } catch {
    return false
  }
}

/** @returns {boolean} false when storage refused, or the key is not declared */
export function removeKey(name, storage) {
  if (!isDeclared(name)) return false
  const s = browser(storage)
  if (!s) return false
  try {
    s.removeItem(name)
    return true
  } catch {
    return false
  }
}

const validId = (id) => (typeof id === 'string' && ACCOUNT_ID.test(id) ? id : null)

/** `outbox:{account}` → `outbox:42`; null without a valid account id. */
export function forAccount(template, accountId) {
  const id = validId(accountId)
  return id ? template.replace('{account}', id) : null
}

/** The account this browser's session is bound to, or null. */
export const accountOf = (storage) => validId(readKey(KEY.accountId, storage))

/** The signed-in account's offline queue key, or null while no account is bound. */
export const outboxKey = (storage) => forAccount(KEY.outbox, accountOf(storage))

/**
 * Where the outbox keeps its queue: the bound account's namespace; while a session has no account
 * bound yet (the previous deploy's session on its first load, `/auth/me` not reached), the
 * unnamespaced legacy queue, exactly as that deploy kept it, so a reload loses nothing; the next
 * bind migrates it (`SHIM-FE-001`). Signed out: null, memory only.
 */
export const queueKey = (storage) => outboxKey(storage) ?? (readKey(KEY.token, storage) ? LEGACY.outbox : null)

/** The signed-in account's capture draft key, or null while no account is bound. */
export const draftKey = (storage) => forAccount(KEY.draft, accountOf(storage))

/** The session token, or null. */
export const readToken = (storage) => readKey(KEY.token, storage) ?? null

/** The signed-in username, or null. */
export const readUsername = (storage) => readKey(KEY.username, storage) ?? null

/**
 * A login succeeded: keep its token and bind the account the login response names. The previous
 * account's binding goes first, so nothing reaches that namespace with the new token.
 *
 * What an earlier version left unnamespaced can no longer be attributed by the username alone: an
 * account deleted and registered again keeps the name (review of brief 0075). So a fresh login
 * marks the legacy ops `prior` — `bindAccount` adopts one only when it is younger than the
 * account — and drops the legacy draft, which carries no time to prove anything by.
 */
export function startSession({ token, username, accountId }, storage) {
  removeKey(KEY.accountId, storage)
  markLegacyUnproven(storage)
  writeKey(KEY.token, token, storage)
  writeKey(KEY.username, username, storage)
  const id = validId(accountId)
  if (id) writeKey(KEY.accountId, id, storage)
}

function markLegacyUnproven(storage) {
  removeKey(LEGACY.draft, storage)
  const text = readKey(LEGACY.outbox, storage)
  if (!text) return
  const ops = restore(text)
  if (!ops.length) removeKey(LEGACY.outbox, storage)
  else if (ops.some((op) => !op.prior)) writeKey(LEGACY.outbox, serialize(ops.map((op) => ({ ...op, prior: true }))), storage)
}

/**
 * The date from which a bind sweeps every legacy key, whoever left it (`SHIM-FE-001`'s expiry):
 * by then every browser in use has migrated, and what is left is nobody's to keep.
 */
export const LEGACY_SWEEP_FROM = Date.parse('2027-03-01T00:00:00Z')

/** The keys an earlier version kept and the server is now asked for (`/auth/me`). */
const DERIVED = [LEGACY.role, LEGACY.fullName, LEGACY.email]

/**
 * `/auth/me` named the account: bind the session to it and migrate what the previous version
 * left for this account (`SHIM-FE-001`); from `LEGACY_SWEEP_FROM` on, sweep the legacy keys.
 * `createdAt` (ISO) is when the account was created.
 *
 * `token` is the session the answer was asked for: when the profile's token is another one by
 * now (another tab signed in, a logout, a 401), the answer is about a session that is gone and
 * binds nothing. Nor does an answer replace an account already bound — a login binds the id its
 * response names, and a token never changes account — so a late answer of an earlier account
 * can never hand that account's namespace to the current session (review of brief 0075, round 3).
 *
 * @returns {boolean} false when the id cannot namespace, the session is not the one asked for,
 *   or another account is bound
 */
export function bindAccount({ accountId, username, createdAt, token }, storage, now = Date.now()) {
  const id = validId(accountId)
  if (!id) return false
  if (token !== undefined && (!token || readToken(storage) !== token)) return false
  const bound = accountOf(storage)
  if (bound && bound !== id) return false
  writeKey(KEY.accountId, id, storage)
  if (username) writeKey(KEY.username, username, storage)
  for (const key of DERIVED) removeKey(key, storage)
  if (username) migrateLegacy(id, username, Date.parse(createdAt ?? ''), storage)
  if (now >= LEGACY_SWEEP_FROM) for (const key of Object.values(LEGACY)) removeKey(key, storage)
  return true
}

/**
 * Move this account's ops and draft out of the unnamespaced legacy keys into `id`'s namespace.
 * An op the session's own deploy left (not `prior`) is the session's. A `prior` op (a fresh login
 * came between) is this account's only when it is younger than the account (`created`, ms);
 * older, it is provably an earlier account's of the same name and is removed; with no creation
 * time to compare, it stays where it is, unread. Clock skew between browser and server shifts
 * the line by that much (ADR 0047).
 */
function migrateLegacy(id, username, created, storage) {
  const legacyQueue = readKey(LEGACY.outbox, storage)
  if (legacyQueue) {
    const ops = restore(legacyQueue)
    const known = Number.isFinite(created)
    const verdict = (op) => {
      if (op.user !== username) return 'rest'
      if (!op.prior) return 'mine'
      if (!known || typeof op.at !== 'number') return 'rest'
      return op.at >= created ? 'mine' : 'dead'
    }
    const mine = ops.filter((op) => verdict(op) === 'mine').map((op) => {
      const own = { ...op }
      delete own.prior
      return own
    })
    const rest = ops.filter((op) => verdict(op) === 'rest')
    let moved = true
    if (mine.length) {
      const key = forAccount(KEY.outbox, id)
      const stored = restore(readKey(key, storage))
      const seen = new Set(stored.map((op) => op.id))
      moved = writeKey(key, serialize([...stored, ...mine.filter((op) => !seen.has(op.id))]), storage)
    }
    // Only once the ops are safely in the namespace may they leave the legacy queue; a provably
    // dead op leaves with them. An unreadable queue is nobody's.
    if (moved && (rest.length < ops.length || !ops.length)) {
      if (rest.length) writeKey(LEGACY.outbox, serialize(rest), storage)
      else removeKey(LEGACY.outbox, storage)
    }
  }

  const legacyDraft = readKey(LEGACY.draft, storage)
  if (legacyDraft) {
    let draft
    try {
      draft = JSON.parse(legacyDraft)
    } catch {
      draft = null
    }
    if (!draft || typeof draft !== 'object') removeKey(LEGACY.draft, storage)
    else if (draft.user === username) {
      const key = forAccount(KEY.draft, id)
      const kept = readKey(key, storage) || writeKey(key, legacyDraft, storage)
      if (kept) removeKey(LEGACY.draft, storage)
    }
  }
}

/** A session ended without a logout (a 401): drop the token, lock the rest. */
export function lockSession(storage) {
  removeKey(KEY.token, storage)
}

const idsIn = (key, storage) => (key ? restore(readKey(key, storage)).map((op) => op.id) : [])

/** The page's live queue (`useOutbox` reports it): ops storage may not hold. */
let livePending = () => []

/**
 * The outbox reports the ids of the ops it holds in memory — the queue storage refused, or one
 * not yet written — so a logout asks about them too (review of brief 0075). One outbox per page.
 * @param {() => string[]} probe
 */
export function reportPending(probe) {
  livePending = probe
}

function liveIds() {
  try {
    const ids = livePending()
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

/**
 * How many changes this browser has not delivered and a logout would discard: the account's own
 * queue, whatever an earlier version left in the unnamespaced one, and what only the page holds;
 * each op counted once.
 */
export function pendingChanges(storage) {
  return new Set([...idsIn(outboxKey(storage), storage), ...idsIn(LEGACY.outbox, storage), ...liveIds()]).size
}

/**
 * Remove this account's data from the profile: token, identity, its queue and draft, and every
 * legacy key. UI preferences stay; another account's locked namespace stays for that account.
 */
export function purgeAccount(storage) {
  const id = accountOf(storage)
  for (const template of [KEY.outbox, KEY.draft]) {
    const key = forAccount(template, id)
    if (key) removeKey(key, storage)
  }
  // The binding goes before the token: a write racing the purge then finds no namespace at all.
  removeKey(KEY.accountId, storage)
  removeKey(KEY.token, storage)
  removeKey(KEY.username, storage)
  for (const key of Object.values(LEGACY)) removeKey(key, storage)
}

/**
 * An explicit logout (decision D6). With unsent changes, `confirm(n)` decides: false is
 * "Abbrechen" and changes nothing; true is "abmelden und lokale Änderungen verwerfen".
 *
 * @param {object} io
 * @param {(n: number) => boolean} io.confirm
 * @param {() => void} io.leave  a full page load, so the in-memory snapshot goes with the page
 *   (a copy the browser keeps in its back/forward cache is reloaded on `pageshow`: `stores/auth.js`)
 * @param {Storage} [io.storage]
 * @returns {boolean} whether the session was ended
 */
export function signOut({ confirm, leave, storage }) {
  const pending = pendingChanges(storage)
  if (pending > 0 && !confirm(pending)) return false
  purgeAccount(storage)
  leave()
  return true
}

/** Fired on `window` when `/auth/me` bound the session to an account (the outbox reloads its queue). */
export const ACCOUNT_BOUND = 'runway:account-bound'
