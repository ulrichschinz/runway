import { onBeforeUnmount, onMounted, shallowReactive, toValue } from 'vue'
import { CHORD_MS, ownsKey, repeatsOnHold, resolveKey } from '../shared/commands.js'

/**
 * The new UI's keys (plan M5, M9): one `keydown` listener on the window, resolved against the one
 * command table (`shared/commands.js`), for every keymap mounted right now.
 *
 * A keymap is a layer: the frame mounts one with what it owns (Gehe zu, `?`, `/`, Darstellung), the
 * page one with its rows' and its own keys. The layers act as one: the latest mounted wins a
 * command both bind, its scopes come first, and a chord (`g` then `i`) is one chord whichever
 * layer ends it. The command palette offers what the layers hold (`activeKeymap`), so a palette
 * entry runs the same handler as its key.
 */

const layers = shallowReactive([])
let pending = null
let timer = 0
/** Modals mounted right now (`useModal`): while any is, no layer takes a key. */
let modals = 0

/**
 * What the mounted keymaps hold together: the handlers by command id, the active scopes (latest
 * layer's first, `global` implied) and the offers of the palette (see `paletteCommands`). Reactive
 * while read inside a computed: layers come and go with their components, offers read the page.
 *
 * @returns {{handlers: Object<string, Function>, scopes: string[], offers: Object<string, boolean|object>}}
 */
export function activeKeymap() {
  const handlers = {}
  const offers = {}
  for (const layer of layers) {
    Object.assign(handlers, layer.handlers)
    Object.assign(offers, layer.offers?.() ?? {})
  }
  const scopes = [...new Set([...layers].reverse().flatMap((layer) => toValue(layer.scopes)))]
  return { handlers, scopes, offers }
}

function onKey(event) {
  if (event.defaultPrevented || !ownsKey(event, modals > 0)) {
    pending = null
    return
  }
  const { handlers, scopes } = activeKeymap()
  const { command, pending: next } = resolveKey(pending, event.key, scopes)
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

/**
 * Mount a keymap layer while the calling component lives.
 *
 * @param {Object<string, (event?: KeyboardEvent) => void>} handlers by command id; a command
 *   without a handler in any layer is left to the browser
 * @param {string[]|(() => string[])} scopes the table scopes this layer adds besides `global`
 *   (`rows`, `next`, `all`, …)
 * @param {() => Object<string, boolean|object>} [offers] what the palette may offer now, by
 *   command id (the cursor row's actions, with the todo's text for the label)
 */
export function useKeymap(handlers, scopes = [], offers = null) {
  const layer = { handlers, scopes, offers }
  onMounted(() => {
    if (!layers.length) window.addEventListener('keydown', onKey)
    layers.push(layer)
  })
  onBeforeUnmount(() => {
    const i = layers.indexOf(layer)
    if (i >= 0) layers.splice(i, 1)
    if (!layers.length) {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
      pending = null
    }
  })
}

/**
 * Mark the calling component as a modal (the command palette, the `?` sheet) while it lives: no
 * keymap layer acts behind it, wherever the focus is — also after a click on the modal's text
 * has moved it to `<body>`. The modal handles its own keys.
 */
export function useModal() {
  onMounted(() => {
    modals += 1
    pending = null
  })
  onBeforeUnmount(() => {
    modals -= 1
  })
}
