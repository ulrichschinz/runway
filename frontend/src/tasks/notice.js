import { readonly, ref } from 'vue'
import { HOLD_MS } from '../shared/outboxQueue.js'

/**
 * The one notice of the new UI (06 `notify`): a message key, and Rückgängig while the
 * action can still be taken back. A new notice replaces the old one; it goes after the
 * outbox hold (`HOLD_MS`), so its drain line ends when a held done leaves for the server.
 */

const current = ref(null)
let timer = 0
let seq = 0

/**
 * @param {string} text the message, already through `t()`
 * @param {(() => void)|null} [undo] what Rückgängig does; none for a plain notice
 */
export function showNotice(text, undo = null) {
  clearTimeout(timer)
  const id = ++seq
  current.value = { id, text, undo, ms: HOLD_MS }
  timer = setTimeout(() => {
    if (current.value?.id === id) current.value = null
  }, HOLD_MS)
}

export function clearNotice() {
  clearTimeout(timer)
  current.value = null
}

/** Rückgängig on the notice (button or `z`): runs its undo once and closes it. */
export function undoNotice() {
  const undo = current.value?.undo
  if (!undo) return false
  clearNotice()
  undo()
  return true
}

export const notice = readonly(current)
