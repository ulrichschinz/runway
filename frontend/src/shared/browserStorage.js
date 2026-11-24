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
 *   declarations into `ops/surfaces/spa.json`, so a new key cannot appear without a snapshot diff;
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
  const s = browser(storage)
  if (!s) return undefined
  try {
    return s.getItem(name)
  } catch {
    return undefined
  }
}

/** @returns {boolean} false when storage refused the write */
export function writeKey(name, value, storage) {
  const s = browser(storage)
  if (!s) return false
  try {
    s.setItem(name, value)
    return true
  } catch {
    return false
  }
}

/** @returns {boolean} false when storage refused */
export function removeKey(name, storage) {
  const s = browser(storage)
  if (!s) return false
  try {
    s.removeItem(name)
    return true
  } catch {
    return false
  }
}

/** An account id fit to be part of a key: what `GET /auth/me` sends, nothing a path or `:` can hide in. */
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/

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

/** The signed-in account's capture draft key, or null while no account is bound. */
export const draftKey = (storage) => forAccount(KEY.draft, accountOf(storage))

/** The session token, or null. */
export const readToken = (storage) => readKey(KEY.token, storage) ?? null

/** The signed-in username, or null. */
export const readUsername = (storage) => readKey(KEY.username, storage) ?? null

/**
 * A login succeeded: keep its token. The previous account's binding goes first, so nothing can
 * reach that account's namespace with the new token before `/auth/me` names the new account.
 */
export function startSession({ token, username }, storage) {
  removeKey(KEY.accountId, storage)
  writeKey(KEY.token, token, storage)
  writeKey(KEY.username, username, storage)
}

/** The keys an earlier version kept and the server is now asked for (`/auth/me`). */
const DERIVED = [LEGACY.role, LEGACY.fullName, LEGACY.email]

/**
 * `/auth/me` named the account: bind the session to it and migrate what the previous version
 * left for this user (`SHIM-FE-001`). @returns {boolean} false when the id cannot namespace
 */
export function bindAccount({ accountId, username }, storage) {
  const id = validId(accountId)
  if (!id) return false
  writeKey(KEY.accountId, id, storage)
  if (username) writeKey(KEY.username, username, storage)
  for (const key of DERIVED) removeKey(key, storage)
  if (username) migrateLegacy(id, username, storage)
  return true
}

/** Move `username`'s ops and draft out of the unnamespaced legacy keys into `id`'s namespace. */
function migrateLegacy(id, username, storage) {
  const legacyQueue = readKey(LEGACY.outbox, storage)
  if (legacyQueue) {
    const ops = restore(legacyQueue)
    const mine = ops.filter((op) => op.user === username)
    const rest = ops.filter((op) => op.user !== username)
    let moved = true
    if (mine.length) {
      const key = forAccount(KEY.outbox, id)
      const stored = restore(readKey(key, storage))
      const known = new Set(stored.map((op) => op.id))
      moved = writeKey(key, serialize([...stored, ...mine.filter((op) => !known.has(op.id))]), storage)
    }
    // Only once the ops are safely in the namespace may they leave the legacy queue.
    if (moved) {
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

const opsIn = (key, storage) => (key ? restore(readKey(key, storage)).length : 0)

/**
 * How many changes this browser has not delivered and a logout would discard: the account's own
 * queue, plus whatever an earlier version left in the unnamespaced one.
 */
export function pendingChanges(storage) {
  return opsIn(outboxKey(storage), storage) + opsIn(LEGACY.outbox, storage)
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
