import { onBeforeUnmount, ref } from 'vue'
import { swipeAxis, swipeCompletes, swipeOffset } from '../shared/gestures.js'

/**
 * Swipe right to complete, on touch screens only (plan M5; the rule is `shared/gestures.js`).
 * The row follows the finger once the gesture is clearly sideways; released far enough it
 * completes, otherwise it springs back. A gesture that starts vertically is the scroller's:
 * the row sets `touch-action: pan-y`, so the browser keeps scrolling and only a sideways
 * move reaches us.
 *
 * @param {() => void} onComplete
 * @returns {{offset: Ref<number>, dragging: Ref<boolean>, handlers: object}} (Vue refs)
 *   bind `handlers` with `v-on` on the row; draw it `offset` px to the right
 */
export function useSwipe(onComplete) {
  const offset = ref(0)
  const dragging = ref(false)
  let start = null

  function reset() {
    start = null
    dragging.value = false
    offset.value = 0
  }

  function onPointerdown(event) {
    if (event.pointerType !== 'touch' || !event.isPrimary) return
    start = { x: event.clientX, y: event.clientY, id: event.pointerId, axis: null, width: event.currentTarget.offsetWidth }
  }

  function onPointermove(event) {
    if (!start || event.pointerId !== start.id) return
    const dx = event.clientX - start.x
    start.axis ??= swipeAxis(dx, event.clientY - start.y)
    if (start.axis === 'y') {
      reset()
      return
    }
    if (start.axis === 'x') {
      if (!dragging.value) {
        dragging.value = true
        // Keep the gesture when the finger leaves the row; a pointer the browser no longer
        // tracks cannot be captured, and the row still follows the events it gets.
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // not capturable
        }
      }
      offset.value = swipeOffset(dx)
    }
  }

  function onPointerup(event) {
    if (!start || event.pointerId !== start.id) return
    const done = swipeCompletes({ pointerType: event.pointerType, axis: start.axis, dx: event.clientX - start.x, width: start.width })
    reset()
    if (done) onComplete()
  }

  onBeforeUnmount(reset)

  return {
    offset,
    dragging,
    handlers: { pointerdown: onPointerdown, pointermove: onPointermove, pointerup: onPointerup, pointercancel: reset },
  }
}
