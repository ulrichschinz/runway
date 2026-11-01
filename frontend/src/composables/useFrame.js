import { inject, provide } from 'vue'

/**
 * What the new UI's frame shows, handed from the composition root to every page (brief 0050).
 *
 * `layout/AppFrame.vue` imports no store: it receives counts, Stand, the user and the outbox line
 * as props. Pages live in three feature units, and `fe/identity` may not read the task store, so
 * the props are assembled once in `fe/app` (`router/NewUiHost.vue`) and provided here; a page binds
 * them with `<AppFrame v-bind="frame.props" v-on="frame.on">` and fills the slots itself.
 *
 * @typedef {object} Frame
 * @property {import('vue').ComputedRef<object>} props  AppFrame's props: view, counts, flags,
 *   stand, offline, failedCount, user, themeChoice
 * @property {object} on  AppFrame's event handlers: retry, theme, signout
 * @property {import('vue').ComputedRef<string|null>} taskId  the uuid `?task=` names (validated)
 * @property {import('vue').Ref<null|{uuid: string, description?: string, missing?: boolean}>} task
 *   the todo a `?task=` link asked for, once read
 * @property {(uuid: string) => void} openTask  puts `?task=<uuid>` into the address (the detail opens)
 * @property {() => void} closeTask  drops `?task=` from the address
 */

const FRAME = Symbol('frame')

/** @param {Frame} frame */
export function provideFrame(frame) {
  provide(FRAME, frame)
}

/** @returns {Frame} */
export function useFrame() {
  const frame = inject(FRAME, null)
  if (!frame) throw new Error('useFrame() outside the new UI host')
  return frame
}
