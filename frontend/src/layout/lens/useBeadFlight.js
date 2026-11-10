/**
 * The bead's flight (plan M11; 06 `flyToLens`, `syncProgress`): a coral bead runs along a thread
 * from a ticked-off todo's ring, through the left gutter and the band above the head, into the
 * Tageslinse; the level rises when it lands. Only for a todo that counts for today, with a lens on
 * screen and motion allowed (`flightAllowed`, decided by the caller).
 *
 * `BeadFlight.vue` (mounted once by the frame) lends its overlay; without it nothing flies. While a
 * bead flies, `useShownProgress` holds the numbers a page shows, so "3 von 7" turns into "4 von 7"
 * when the bead lands, not when the key is pressed. The write never waits for the flight.
 */
import { computed, ref } from 'vue'
import {
  FLIGHT_MS, LAND_MAX_MS, beadRoute, clampLevel, easeOut, easePull, flightAllowed, settleWithin,
} from '../../shared/lensMath.js'
import { drop, entry, setLevel, visibleSlot } from './lensController.js'

/** Beads in the air. */
export const flights = ref(0)
/** Bumped when a bead lands, so a caption can roll. */
export const landings = ref(0)

let overlay = null

/** `BeadFlight.vue` lends its SVG; null when it unmounts. */
export function setOverlay(svg) {
  overlay = svg
}

/**
 * Hold a page's progress while a bead flies.
 *
 * @param {() => object|null} progress the live progress (`gtd.progress`)
 * @returns {object} a computed ref: the progress to show
 */
export function useShownProgress(progress) {
  let held = null
  return computed(() => {
    const live = progress()
    if (flights.value > 0 && held) return held
    held = live
    return live
  })
}

/**
 * Fly a bead from a ring into the visible lens.
 *
 * @param {DOMRect} ring the ring's box, taken before its row leaves
 * @param {() => number} levelNow the store's level now; asked when the bead lands, so a tick taken
 *   back in the meantime does not raise the lens
 * @returns {{landed: Promise<void>, cancel: () => void}} `landed` resolves when it has landed (at
 *   once when nothing can fly; at most `LAND_MAX_MS` after it reaches the lens); `cancel` (Rückgängig
 *   while it flies) takes the bead and its thread away: nothing lands, the caption does not roll
 */
export function flyToLens(ring, levelNow) {
  const E = entry()
  if (!E || !overlay) return { landed: Promise.resolve(), cancel: () => {} }
  flights.value += 1
  const from = { x: ring.left + ring.width / 2, y: ring.top + ring.height / 2 }
  const band = visibleSlot()?.closest('header')?.getBoundingClientRect().top ?? null
  const ns = 'http://www.w3.org/2000/svg'
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', beadRoute(from, E, band))
  overlay.appendChild(path)
  const len = path.getTotalLength()
  const bead = document.createElement('div')
  bead.className = 'rw-bead'
  document.body.appendChild(bead)
  const t0 = performance.now()
  // the level this tick brought; lower if the store has fallen since (the tick taken back), never
  // a later tick's level (that one has its own bead)
  const launched = levelNow()
  let state = 'flying' // → 'landing' → 'landed', or → 'cancelled'
  let done = () => {}
  const landed = new Promise((resolve) => {
    done = resolve
  })
  const clear = () => {
    bead.remove()
    path.remove()
  }
  const land = () => {
    if (state !== 'flying') return
    state = 'landing'
    clear()
    // a lens that never reports the landing (lost context, replaced fall) must not hold the caption
    settleWithin(drop(clampLevel(Math.min(launched, levelNow())), 6 / ((E.size || 104) / 104)), LAND_MAX_MS).then(() => {
      state = 'landed'
      flights.value -= 1
      landings.value += 1
      // the last bead down: the lens shows the store's level now (a tick taken back during the fall
      // sinks it again; the caption, no longer held, shows the same)
      if (flights.value === 0) setLevel(levelNow())
      done()
    })
  }
  const frame = (now) => {
    if (state !== 'flying') return
    // a hidden tab gets no frames: land at once
    if (document.hidden) {
      land()
      return
    }
    const el = now - t0
    const drawn = easeOut(el / FLIGHT_MS.draw) * len
    const k = easePull((el - FLIGHT_MS.start) / FLIGHT_MS.fly)
    const s = k * len
    path.style.strokeDasharray = `${Math.max(0, drawn - s)} ${len * 2}`
    path.style.strokeDashoffset = `${-s}`
    const p = path.getPointAtLength(s)
    bead.style.transform = `translate(${p.x}px, ${p.y}px)`
    bead.style.opacity = el >= FLIGHT_MS.start - 30 ? '1' : '0'
    if (k < 1) {
      requestAnimationFrame(frame)
      return
    }
    land()
  }
  requestAnimationFrame(frame)
  const cancel = () => {
    if (state !== 'flying') return
    state = 'cancelled'
    clear()
    flights.value -= 1
    done()
  }
  return { landed, cancel }
}

const onScreen = (r) => r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth

/**
 * Ready a bead for a todo about to be ticked off: decided now, while its ring is still on screen.
 *
 * @param {Element|null} ringEl the todo's ring
 * @param {boolean} counts whether the todo counts for today (`countsAsPlanned`)
 * @returns {null|((levelNow: () => number) => {landed: Promise<void>, cancel: () => void})} launch it
 *   once the write is done (`flyToLens`); null when no bead flies (`flightAllowed`)
 */
export function readyBead(ringEl, counts) {
  const ring = ringEl?.getBoundingClientRect() ?? null
  const ok = flightAllowed({
    counts,
    slot: !!overlay && !!visibleSlot(),
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ring: !!ring && onScreen(ring),
  })
  return ok ? (levelNow) => flyToLens(ring, levelNow) : null
}
