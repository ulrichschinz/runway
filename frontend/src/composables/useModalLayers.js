/**
 * The palette and the `?` sheet: at most one is open, and while either is, everything behind it
 * is inert (brief 0062): out of the accessibility tree and out of reach, as `aria-modal` promises.
 *
 * The page behind is made inert once the layer is up (`flush: 'post'`) and freed in the same step
 * as the last layer closes, so the focus it gives back can land behind it. Both flags are watched,
 * not the one "a layer is open" value: the palette's "Tastenkürzel" closes the palette and opens
 * the sheet in one tick, and that value is true before and after, so a watcher on it would not run
 * and the page behind the sheet would stay live (review of brief 0062).
 *
 * @param {(on: boolean) => void} setBehindInert
 */
import { ref, shallowRef, watch } from 'vue'

export function useModalLayers(setBehindInert) {
  const palette = ref(false)
  const sheet = ref(false)
  /** Where the focus goes back to when the palette or the sheet closes: captured as the first opens. */
  const returnTo = shallowRef(null)

  /** Open the palette or the `?` sheet in place of the other; the focus target stays the first one's. */
  function open(which, active = null) {
    if (!palette.value && !sheet.value) returnTo.value = active
    palette.value = which === 'palette'
    sheet.value = which === 'sheet'
  }

  function close(which) {
    if (which === 'palette') palette.value = false
    else sheet.value = false
    if (!palette.value && !sheet.value) setBehindInert(false)
  }

  watch([palette, sheet], ([p, s]) => (p || s) && setBehindInert(true), { flush: 'post' })

  return { palette, sheet, returnTo, open, close }
}
