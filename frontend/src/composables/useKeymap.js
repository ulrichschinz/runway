import { onBeforeUnmount, onMounted, toValue } from 'vue'
import { CHORD_MS, ownsKey, repeatsOnHold, resolveKey } from '../shared/commands.js'

/**
 * The page's keys (plan M5): one `keydown` listener on the window while the calling component
 * lives, resolved against the one command table (`shared/commands.js`).
 *
 * @param {Object<string, (event: KeyboardEvent) => void>} handlers by command id; a command
 *   without a handler on this page is left to the browser
 * @param {string[]|(() => string[])} scopes the table scopes this page has
 *   besides `global` (`rows`, `next`, `all`)
 */
export function useKeymap(handlers, scopes) {
  let pending = null
  let timer = 0

  function onKey(event) {
    if (event.defaultPrevented || !ownsKey(event)) {
      pending = null
      return
    }
    const { command, pending: next } = resolveKey(pending, event.key, toValue(scopes))
    clearTimeout(timer)
    pending = next
    if (next) {
      event.preventDefault()
      timer = setTimeout(() => {
        pending = null
      }, CHORD_MS)
      return
    }
    const run = command && handlers[command]
    if (!run) return
    event.preventDefault()
    if (event.repeat && !repeatsOnHold(command)) return
    run(event)
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    clearTimeout(timer)
  })
}
