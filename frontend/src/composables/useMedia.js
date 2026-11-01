import { onScopeDispose, ref } from 'vue'

/** The new UI's widths (06 `web.css`): phone at or below 760 px, the margin column above 1180 px. */
export const PHONE = '(max-width: 760px)'
export const WIDE = '(min-width: 1181px)'

/**
 * Whether a media query matches, kept current while the calling component lives.
 *
 * @param {string} query
 * @returns {import('vue').Ref<boolean>}
 */
export function useMedia(query) {
  const list = window.matchMedia(query)
  const matches = ref(list.matches)
  const update = (event) => {
    matches.value = event.matches
  }
  list.addEventListener('change', update)
  onScopeDispose(() => list.removeEventListener('change', update))
  return matches
}

/**
 * The visual viewport's height and top, so a bottom dock can sit above an on-screen keyboard.
 *
 * Browsers shrink only the visual viewport when the keyboard opens (Chrome on Android since 108,
 * Safari always); `100dvh` keeps the layout height and the dock would end up under the keyboard.
 * Null where the browser has no `visualViewport`; the frame then falls back to `100dvh`.
 *
 * @returns {import('vue').Ref<null|{height: number, top: number}>}
 */
export function useVisualViewport() {
  const vv = window.visualViewport
  const box = ref(null)
  if (!vv) return box
  const update = () => {
    box.value = { height: Math.round(vv.height), top: Math.round(vv.offsetTop) }
  }
  update()
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  onScopeDispose(() => {
    vv.removeEventListener('resize', update)
    vv.removeEventListener('scroll', update)
  })
  return box
}
