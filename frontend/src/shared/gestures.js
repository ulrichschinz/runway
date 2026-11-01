/**
 * Swipe to complete (plan M5, shared with Android): the threshold rule, pure.
 *
 * Touch only — a mouse or a pen never completes by dragging. A gesture is decided once,
 * after it has moved `AXIS_SLOP_PX`: mostly sideways, the row follows the finger; mostly
 * vertical, it belongs to the scroller and never completes. A sideways swipe completes when
 * it is released to the right past 35 % of the row's width, and never less than 96 px.
 */

export const SWIPE_SHARE = 0.35
export const SWIPE_MIN_PX = 96
export const AXIS_SLOP_PX = 10

/**
 * The axis a gesture is locked to, or null while it is still too short to tell.
 *
 * @param {number} dx px moved to the right since the finger went down
 * @param {number} dy px moved down
 * @returns {'x'|'y'|null}
 */
export function swipeAxis(dx, dy) {
  if (Math.hypot(dx, dy) < AXIS_SLOP_PX) return null
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
}

/** How far a row of `width` px must travel to complete. */
export const swipeThreshold = (width) => Math.max(width * SWIPE_SHARE, SWIPE_MIN_PX)

/**
 * Where the row is drawn while it follows the finger: to the right only.
 *
 * @param {number} dx
 * @returns {number} px, never negative
 */
export const swipeOffset = (dx) => Math.max(0, dx)

/**
 * Whether a released gesture completes the todo.
 *
 * @param {{pointerType: string, axis: 'x'|'y'|null, dx: number, width: number}} gesture
 * @returns {boolean}
 */
export function swipeCompletes({ pointerType, axis, dx, width }) {
  return pointerType === 'touch' && axis === 'x' && dx >= swipeThreshold(width)
}
