/**
 * The capture line's draft (plan M6, brief 0052): what is typed and not yet sent, kept in
 * `localStorage['captureDraft']` as `{user, tab, text}` so it survives a reload and belongs to the
 * account that typed it — a draft is never shown to, or captured for, another user of the
 * same browser. `tab` is the page it was typed on: every tab shows the draft, but only that
 * page files it when it goes away (`takeDraft`), so closing another tab never captures a
 * half-typed thought. Storage that refuses reads as no draft.
 */

/** This page's mark on the draft it types. */
const TAB = Math.random().toString(36).slice(2) + Date.now().toString(36)

/** The signed-in user (`stores/auth.js` keeps it), or null. */
function currentUser() {
  try {
    return localStorage.getItem('username')
  } catch {
    return null
  }
}

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
  if (!user) return null
  try {
    const draft = JSON.parse(stored === undefined ? localStorage.getItem('captureDraft') : stored)
    return draft?.user === user && typeof draft.text === 'string' && draft.text ? draft : null
  } catch {
    return null
  }
}

/** Keep `text` as the signed-in user's draft; an empty text removes it. */
export function saveDraft(text) {
  const user = currentUser()
  try {
    if (user && text) localStorage.setItem('captureDraft', JSON.stringify({ user, tab: TAB, text }))
    else localStorage.removeItem('captureDraft')
  } catch {
    // Storage refused: the draft lives in the field only.
  }
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
