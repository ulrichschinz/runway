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

/**
 * The card stack (plan M10, 06 `stack.js trayAt`): which tray a dragged card is over, or lands
 * in when let go. The tray under the point wins; outside every tray the nearest one counts. While
 * dragging, a tray counts within 22 px of its edge, looking a little ahead
 * along the hand's velocity (0.12 s). On release within 30 px: first where the pointer is (a card
 * let go over a tray stays there, however fast the hand still moved — 06 looked only ahead and
 * could carry a moving drop past its tray), then ahead. A release faster than `FLICK_PX_S` that
 * is over no tray is a flick: it goes to the tray whose centre lies closest to its direction,
 * within `FLICK_ANGLE` (radians), or nowhere.
 */
export const FLICK_PX_S = 650
export const FLICK_ANGLE = 0.42

/**
 * The tray a point is in, else the nearest one within `margin` px of its edge, else -1. A point
 * inside a tray is always that tray, never a neighbour's margin (trays sit 6–10 px apart, closer
 * than the margin), so the tray lit while dragging is the tray a release at that point files into.
 */
function nearestTray(rects, x, y, margin) {
  let best = -1
  let bestDist = margin
  rects.forEach((r, i) => {
    const dx = Math.max(r.left - x, 0, x - r.right)
    const dy = Math.max(r.top - y, 0, y - r.bottom)
    const dist = Math.hypot(dx, dy)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  })
  return best
}

/**
 * @param {Array<{left: number, top: number, right: number, bottom: number}>} rects the trays' boxes
 * @param {number} x the pointer
 * @param {number} y
 * @param {{vx: number, vy: number}} [velocity] px/s
 * @param {boolean} [release] the card was let go (a wider margin, and flicks count)
 * @returns {number} the tray's index, or -1
 */
export function trayAt(rects, x, y, velocity = { vx: 0, vy: 0 }, release = false) {
  const { vx, vy } = velocity
  const px = x + vx * 0.12
  const py = y + vy * 0.12
  const m = release ? 30 : 22
  const at = (qx, qy) => nearestTray(rects, qx, qy, m)
  const under = release ? at(x, y) : -1
  if (under >= 0) return under
  const hit = at(px, py)
  if (hit >= 0 || !release) return hit
  const speed = Math.hypot(vx, vy)
  if (speed <= FLICK_PX_S) return -1
  let best = -1
  let bestAngle = FLICK_ANGLE
  rects.forEach((r, i) => {
    const dx = (r.left + r.right) / 2 - x
    const dy = (r.top + r.bottom) / 2 - y
    const len = Math.hypot(dx, dy)
    if (!len) return
    const angle = Math.acos(Math.min(1, Math.max(-1, (dx * vx + dy * vy) / (len * speed))))
    if (angle < bestAngle) {
      bestAngle = angle
      best = i
    }
  })
  return best
}
