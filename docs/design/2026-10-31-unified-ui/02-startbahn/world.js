// Startbahn world: where everything sits on the airfield. Pure math, no Three.js, so the
// WebGL scene (scene.js), the static fallback (fallback.js) and the Android header port
// all place the same tokens at the same spots from the same snapshot.
//
// Mapping (README "The airfield"):
//   apron (Vorfeld)        = Inbox, unclarified pucks
//   threshold, three lanes = the three cleared next actions; lane light = urgency tier
//   taxiway queue          = the rest of Nächste, in order
//   holding pattern (sky)  = Warten auf; follow-up due drifts to the inner, nearer ring
//   contrails              = done today, one per completion

export const CAM_H = 1.25
export const VIEWS_WITH_FIELD = ['next', 'inbox', 'waiting']
export const LANE_N = 22

// Urgency tiers (README "Urgency tiers"): how far the lane is lit, and whether the core and
// the lights are coral. Three steps that read at a glance instead of a continuous scale.
export const TIERS = {
  over: { reach: 1, coral: true, ring: true },        // overdue: full lane, coral core, coral ring
  soon: { reach: 0.5, coral: true, ring: false },     // due today or within 3 days: half lane, coral core
  calm: { reach: 3 / LANE_N, coral: false, ring: false }, // everything else: three lights, paper core
}

// opts: horizon = horizon height as a fraction of H; safeTop = first pixel row below the
// stage caption that tokens may use (the waiting camera keeps the rings below it).
export function makeLayout(W, H, lanesPx, tokenYpx, opts = {}) {
  const f = Math.max(H * 1.3, W * 0.44)
  const cx = W / 2
  const cy = Math.round(H * (opts.horizon ?? 0.4))
  const ty = tokenYpx ?? H - 34
  const dTok = (f * CAM_H) / Math.max(36, ty - cy)
  const lp = lanesPx && lanesPx.length === 3 ? lanesPx : [cx - W * 0.27, cx, cx + W * 0.27]
  const lanes = lp.map((px) => ((px - cx) * dTok) / f)
  const mid = (lanes[0] + lanes[2]) / 2
  const half = (lanes[2] - lanes[0]) / 2 + 1.2
  const zTok = -dTok
  const taxiX = mid + half + 2.2
  const apronX0 = taxiX + 2.2
  return {
    W, H, f, cx, cy, dTok, lanes, mid, half, zTok,
    safeTop: opts.safeTop ?? 48, margin: opts.margin ?? 16,
    strip: { x: mid, half, z0: zTok + dTok + 1, z1: -160 },
    keys: { z0: zTok - 0.9, z1: zTok - 3.4, n: 12 },
    taxi: { x: taxiX, half: 0.85, z0: zTok + 0.9, z1: -120 },
    apron: { x0: apronX0, x1: apronX0 + 9.5, z0: zTok + 1.6, z1: zTok - 11 },
    hold: { c: [mid - 21, 5.4, -11], rx: 6.4, rz: 2.9 },
    hangar: [apronX0 + 13, 0, zTok - 6],
  }
}

// Points on the two holding ovals (outer: waiting, inner and nearer: follow-up due).
export function holdPoint(L, ring, ang) {
  const [hx, hy, hz] = L.hold.c
  const rx = L.hold.rx * (ring ? 0.56 : 1), rz = L.hold.rz * (ring ? 0.56 : 1)
  return [hx + Math.cos(ang) * rx, hy - (ring ? 0.85 : 0) + Math.sin(ang * 2) * 0.12, hz + Math.sin(ang) * rz + (ring ? 2.4 : 0)]
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l) }

// Fit a set of world points into the free part of the stage (below the caption, inside the
// margins) by moving the camera along a fixed viewing direction. Pure iteration, a few µs.
function fitCamera(L, pts, dir, pad = 0.45) {
  const F = norm(dir)
  const R = norm(cross(F, [0, 1, 0]))
  const U = cross(R, F)
  const c = mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length)
  let d = 14, pos = sub(c, mul(F, d))
  const x0 = L.margin, x1 = L.W - L.margin, y0 = L.safeTop, y1 = L.H - L.margin
  for (let it = 0; it < 14; it++) {
    let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9
    for (const p of pts) {
      const v = sub(p, pos), z = dot(v, F)
      const sx = L.cx + (L.f * dot(v, R)) / z, sy = L.cy - (L.f * dot(v, U)) / z, r = (L.f * pad) / z
      bx0 = Math.min(bx0, sx - r); bx1 = Math.max(bx1, sx + r); by0 = Math.min(by0, sy - r); by1 = Math.max(by1, sy + r)
    }
    const k = Math.max((bx1 - bx0) / (x1 - x0), (by1 - by0) / (y1 - y0))
    const dx = (bx0 + bx1) / 2 - (x0 + x1) / 2, dy = (by0 + by1) / 2 - (y0 + y1) / 2
    pos = add(pos, add(mul(R, (dx * d) / L.f), mul(U, (-dy * d) / L.f)))
    const nd = d * (0.15 + 0.85 * k)
    pos = sub(pos, mul(F, nd - d)); d = nd
  }
  return { pos, target: add(pos, mul(F, 40)) }
}

export function cameraFor(view, L) {
  if (view === 'inbox') {
    const ax = (L.apron.x0 + L.apron.x1) / 2
    return { pos: [ax - 1.4, 3.7, L.zTok + 1.2], target: [ax - 0.9, 0, L.zTok - 6.4] }
  }
  if (view === 'waiting') {
    const pts = []
    for (const ring of [false, true]) for (let i = 0; i < 16; i++) pts.push(holdPoint(L, ring, (i / 16) * Math.PI * 2))
    return fitCamera(L, pts, [-2.5, -3.8, -11.1], 0.42)
  }
  return { pos: [L.mid, CAM_H, 0], target: [L.mid, CAM_H, -100] }
}

const seeded = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

// snapshot: { cleared:[{id,tier,started}], queue:[{id,tier}], inbox:[{id,fresh}], waiting:[{id,due}], done:n }
export function targetsFor(snap, L) {
  const out = new Map()
  snap.cleared.forEach((t, i) => {
    out.set(t.id, { kind: 'cleared', pos: [L.lanes[i], 0, L.zTok], yaw: 0, scale: 1, lane: i, ...t })
  })
  snap.queue.slice(0, 12).forEach((t, j) => {
    out.set(t.id, { kind: 'queue', pos: [L.taxi.x, 0, L.zTok - 2.6 - j * 2.05], yaw: 0, scale: 0.74, slot: j, ...t })
  })
  const cols = 4
  const ax = (L.apron.x0 + L.apron.x1) / 2
  snap.inbox.slice(0, 16).forEach((t, k) => {
    const r = Math.floor(k / cols), c = k % cols
    const jx = (seeded(t.id) - 0.5) * 0.5, jz = (seeded(t.id + 9) - 0.5) * 0.45
    out.set(t.id, {
      kind: 'puck',
      pos: [ax - 3.2 + c * 1.75 + jx + (r % 2) * 0.7, 0, L.zTok - 3.4 - r * 1.7 + jz],
      yaw: (seeded(t.id + 3) - 0.5) * 1.2, scale: 1, ...t,
    })
  })
  const due = snap.waiting.filter((w) => w.due)
  const calm = snap.waiting.filter((w) => !w.due)
  const place = (list, ring) => list.forEach((t, k) => {
    const a = (k / Math.max(1, list.length)) * Math.PI * 2 + (ring ? 0.9 : 0.25)
    const p = holdPoint(L, ring, a)
    const rx = L.hold.rx * (ring ? 0.56 : 1), rz = L.hold.rz * (ring ? 0.56 : 1)
    const yaw = Math.atan2(-Math.cos(a) * rx, Math.sin(a) * rz) // tangent of the oval
    out.set(t.id, { kind: 'hold', pos: p, yaw, bank: ring ? 0.32 : 0.22, scale: ring ? 1.22 : 1.05, ...t })
  })
  place(calm, false)
  place(due, true)
  return out
}

// Light per lane follows the urgency tier of the token in that lane (0 = dark lane).
// tier code for shaders: 0 calm (paper lights), 1 soon (coral), 2 over (coral, brighter).
export const TIER_CODE = { calm: 0, soon: 1, over: 2 }
export function laneLights(snap) {
  return [0, 1, 2].map((i) => {
    const t = snap.cleared[i]
    if (!t) return { level: 0, tier: 'calm', code: 0 }
    const tier = t.tier || 'calm'
    return { level: TIERS[tier].reach, tier, code: TIER_CODE[tier] }
  })
}

// One contrail per completion today, alternating sides, climbing into the sky.
export function contrailPoints(i, L, n = 28) {
  const side = i % 2 === 0 ? 1 : -1
  const k = Math.floor(i / 2)
  const start = [L.mid + side * 0.3, 1.2, -46 - k * 4]
  const ctrl = [L.mid + side * (1.5 + k), 5.0, -44 - k * 3]
  const end = [L.mid + side * (11 + k * 5.5), 6.4 + k * 1.1, -36 - k * 3]
  const pts = []
  for (let s = 0; s <= n; s++) {
    const u = s / n
    pts.push([0, 1, 2].map((d) => (1 - u) * (1 - u) * start[d] + 2 * (1 - u) * u * ctrl[d] + u * u * end[d]))
  }
  return pts
}

// Liftoff path: accelerate along the lane, rotate, climb. k in 0..1.
export function liftoffAt(k, from) {
  const [x0, , z0] = from
  const roll = Math.min(1, k / 0.6)
  const rs = roll * roll * roll
  const climb = Math.max(0, (k - 0.42) / 0.58)
  const cs = climb * climb
  return {
    pos: [x0 + (0 - x0) * 0.08 * rs, cs * 7.5, z0 - rs * 15 - cs * 22],
    pitch: Math.min(0.42, climb * 0.7),
  }
}

// Pinhole projection matching scene.js (asymmetric frustum, principal point cx, cy).
export function projector(cam, L) {
  const fwd = norm(sub(cam.target, cam.pos))
  const right = norm(cross(fwd, [0, 1, 0]))
  const up = cross(right, fwd)
  const toCam = (p) => { const v = sub(p, cam.pos); return [dot(v, right), dot(v, up), dot(v, fwd)] }
  const toScreen = (c) => [L.cx + (L.f * c[0]) / c[2], L.cy - (L.f * c[1]) / c[2], c[2]]
  return { toCam, toScreen, project: (p) => toScreen(toCam(p)) }
}
