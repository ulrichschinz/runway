/**
 * The capture line's draft (plan M6, brief 0052): what is typed and not yet sent, kept under the
 * account's namespace `captureDraft:<accountId>` (`shared/browserStorage.js`, brief 0075) as
 * `{user, tab, text}` so it survives a reload and belongs to the account that typed it — a draft
 * is never shown to, or captured for, another account of the same browser, and an explicit logout
 * removes it. With no account bound there is no draft. `tab` is the page it was typed on: every tab shows the draft, but only that
 * page files it when it goes away (`takeDraft`), so closing another tab never captures a
 * half-typed thought. Storage that refuses reads as no draft.
 */

import { draftKey, readKey, readUsername, removeKey, writeKey } from '../shared/browserStorage.js'

/** This page's mark on the draft it types. */
const TAB = Math.random().toString(36).slice(2) + Date.now().toString(36)

/** The signed-in user (`stores/auth.js` keeps it), or null. */
const currentUser = () => readUsername()

/**
 * Whether a `storage` event's key is this account's draft (null: storage was cleared).
 * @param {string|null} key
 */
export const isDraftKey = (key) => key === null || (key !== undefined && key === draftKey())

/**
 * The draft as stored, if the signed-in user typed it.
 *
 * @param {string|null} [stored] the stored value, when the caller has it (a `storage` event)
 * @returns {string}
 */
export function readDraft(stored) {
  return draftOf(stored)?.text ?? ''
}

/** The stored draft object, if the signed-in user typed it. */
function draftOf(stored) {
  const user = currentUser()
  const key = draftKey()
  if (!user || !key) return null
  try {
    const draft = JSON.parse(stored === undefined ? readKey(key) ?? 'null' : stored)
    return draft?.user === user && typeof draft.text === 'string' && draft.text ? draft : null
  } catch {
    return null
  }
}

/** Keep `text` as the signed-in user's draft; an empty text removes it. */
export function saveDraft(text) {
  const user = currentUser()
  const key = draftKey()
  // No account bound (signed out): the draft lives in the field only. Storage refused: the same.
  if (!key) return
  if (user && text) writeKey(key, JSON.stringify({ user, tab: TAB, text }))
  else removeKey(key)
}

/**
 * The draft this page typed, removed from storage; a draft typed on another tab, or by
 * another user, stays. @returns {string}
 */
export function takeDraft() {
  const draft = draftOf()
  if (!draft || draft.tab !== TAB) return ''
  saveDraft('')
  return draft.text
}
