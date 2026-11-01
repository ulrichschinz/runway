// Orbit model: one source of truth for where every task sits, shared by the Three.js scene
// (web), the SVG map (web, reduced motion / no WebGL / option) and the canvas orbit (Android).
// Pure functions only; no DOM.
//
// After the review (see README, "Changes after review") the model is built for real volume:
// sectors exist only for contexts with open next actions and are weighted by count, a ring and
// sector cell holds at most five beads before a "+N" marker, tasks without a context sit on the
// hub, the inbox tray holds at most seven beads, and waiting items appear only when their
// follow-up is due. `?volume=real` loads a synthetic set with the live counts (39 next actions:
// 29 @computer, 8 @home, 2 without context; 23 in the Inbox). Invented texts only.

import {
  TASKS as DEMO_TASKS, PROJECTS as DEMO_PROJECTS, CONTEXTS as DEMO_CONTEXTS, TODAY,
  tagParts, contextsOf, parseTw,
} from '../shared/data/tasks.js'
export { TODAY, tagParts, contextsOf, parseTw }

const params = new URLSearchParams(globalThis.location?.search || '')
export const VOLUME = params.get('volume') === 'real' ? 'real' : 'demo'

// World units (tokens.json -> orbit). Angle a: 0 = front (towards the viewer, bottom of the
// screen), PI = back (top of the screen); x = r sin a, z = r cos a. Decreasing a runs clockwise
// on screen. Sectors start at the front boundary, so the inbox tray never sits inside a sector.
export const GEO = {
  hub: 0.56, hubRing: 0.4, rimIn: 0.66, rimOut: 2.42,
  rings: [1.0, 1.55, 2.1], wait: 2.95, label: 3.12, tray: 3.42, bead: 0.125,
  groove: 0.09, minSector: 0.8, cellMax: 5, trayMax: 7, trayArc: 0.22,
}
export const RING_NAMES = ['Jetzt', 'Bald', 'Später']
export const RING_HINT = ['überfällig, heute fällig, läuft oder Priorität hoch', 'fällig in sieben Tagen oder Priorität mittel', 'ohne Termin und ohne Priorität']
export const NO_CTX = '∅' // filter value for "ohne Kontext"
export const LISTS = [
  { id: 'inbox', label: 'Inbox', key: '1' },
  { id: 'next', label: 'Nächste', key: '2' },
  { id: 'waiting', label: 'Warten auf', key: '3' },
  { id: 'projects', label: 'Projekte', key: '4' },
  { id: 'someday', label: 'Irgendwann', key: '5' },
]
export const NOW = { day: TODAY, time: '09:12' }

// ---------- data: the shared demo set, or a synthetic set at Uli's live volume ----------
// The demo stores follow-up days in `wait` (which hides a task); the API's follow-up day is
// `scheduled` (inventory 1.5), so waiting items carry it there, the way Android reads it.
const demoTasks = DEMO_TASKS.map((t) => (tagParts(t).includes('waiting') && t.wait && !t.scheduled ? { ...t, scheduled: t.wait, wait: null } : t))

function realVolume() {
  let n = 0
  const mk = (description, extra = {}) => {
    n += 1
    return { id: n, uuid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, description, status: 'pending', project: null, tags: [], priority: null, due: null, scheduled: null, wait: null, urgency: 1, entry: '20261020T080000Z', start: null, annotations: [], ...extra }
  }
  const tasks = []
  const inbox = ['Idee: Kundenstimmen als kurze Videos', 'Rechnung Druckerei prüfen', 'Artikel über Agenten-Evaluation lesen', 'Geburtstagsgeschenk besorgen', 'Winterreifen wechseln lassen',
    'Podcast-Idee mit Kunden', 'Drucker im Büro druckt streifig', 'Rückfrage zur Rechnung 1043', 'Kinoabend planen', 'Buchtipp aus dem Meeting', 'Folienvorlage hat falsche Schrift',
    'Termin Hausarzt', 'Ideen für das Sommerfest', 'Kontoauszüge abheften', 'Zugtickets für Dezember', 'Vortrag aufnehmen', 'Domain verlängern', 'Parkausweis beantragen',
    'Tool-Vergleich für Transkription', 'Spendenquittung suchen', 'Notiz aus dem Zug', 'Schreibtischlampe tauschen', 'Fragen für das Interview sammeln']
  inbox.forEach((d, k) => tasks.push(mk(d, { entry: `202610${String(31 - Math.floor(k / 3)).padStart(2, '0')}T${String(18 - (k % 3) * 4).padStart(2, '0')}0000Z`, urgency: 0.8 })))
  const comp = ['Folien für den Workshop überarbeiten', 'Rechnung an Kunde A schreiben', 'Mail an das Steuerbüro beantworten', 'Website-Texte gegenlesen', 'Backup des Laptops prüfen',
    'Newsletter-Entwurf schreiben', 'Angebotsvorlage aktualisieren', 'Protokoll vom Montag verschicken', 'Fotos vom Event sortieren', 'Passwörter im Manager aufräumen', 'Reisekosten einreichen',
    'Präsentation für Dienstag vorbereiten', 'Use Case als eigene Seite anlegen', 'Kalender für November planen', 'Datenschutzhinweis prüfen', 'Bewerbungen sichten', 'Vertragsentwurf kommentieren',
    'Blogartikel gliedern', 'Notizen aus dem Call ordnen', 'Server-Update einspielen', 'Rechnungsnummern abgleichen', 'LinkedIn-Beitrag entwerfen', 'Kundenliste bereinigen',
    'Agenda für das Quartalstreffen', 'Testzugang für den Piloten einrichten', 'Lizenzen verlängern', 'Feedback-Formular bauen', 'Budget für Q1 skizzieren', 'Fehlerbericht an den Support schreiben']
  const projC = ['Kunde-A.Workshop', 'Kunde-A.Rechnung', 'Buchhaltung', 'Website', 'Website', 'Website', 'Kunde-A.Angebot', 'Kunde-A.Workshop', null, null, 'Buchhaltung', 'Kunde-A.Workshop', 'Website', null,
    'Website', null, 'Kunde-A.Angebot', 'Website', 'Kunde-A.Workshop', null, 'Buchhaltung', 'Website', null, 'Quartalsplanung', 'Kunde-A.Angebot', null, 'Website', 'Quartalsplanung', null]
  comp.forEach((d, k) => {
    const x = { project: projC[k], tags: ['next', '@computer'], urgency: 15 + 2 + (k % 7) * 0.4 }
    if (k < 17) { x.scheduled = '20261028T080000Z'; x.urgency += 5 } // the Taskwarrior bonus the review called out; it no longer decides the ring
    if (k === 0) { x.start = '20261031T081000Z'; x.priority = 'H' }
    if (k === 1) x.due = '20261029T170000Z'
    if (k === 2) x.due = '20261031T150000Z'
    if (k === 3) x.start = '20261031T084500Z'
    if (k === 6 || k === 11) x.priority = 'H'
    if ([4, 7, 9, 16, 23].includes(k)) x.priority = 'M'
    if (k === 12) x.due = '20261103T170000Z'
    if (k === 24) x.due = '20261106T170000Z'
    tasks.push(mk(d, x))
  })
  const home = ['Fahrradlicht reparieren', 'Winterkleidung aus dem Keller holen', 'Zählerstand der Heizung eintragen', 'Regal im Flur montieren', 'Dachrinne reinigen', 'Steuerordner sortieren', 'Vorräte auffüllen', 'Pflanzen umtopfen']
  const projH = ['Zuhause.Flur', 'Zuhause.Keller', null, 'Zuhause.Flur', null, 'Buchhaltung', null, null]
  home.forEach((d, k) => tasks.push(mk(d, { project: projH[k], tags: ['next', '@home'], urgency: 15 + 1 + k * 0.3, ...(k === 2 ? { due: '20261104T170000Z' } : {}), ...(k === 1 ? { priority: 'M' } : {}) })))
  tasks.push(mk('Über die Jahresziele nachdenken', { tags: ['next'], urgency: 16.2, project: 'Quartalsplanung' }))
  tasks.push(mk('Ideen für das Teamfrühstück sammeln', { tags: ['next'], urgency: 15.4 }))
  const wait = [['Unterschrift Kunde A', 'Kunde-A.Angebot', '20261030T080000Z'], ['Feedback zum Logo', 'Website', '20261103T080000Z'], ['Antwort Vermieter zur Kaution', null, '20261029T080000Z'],
    ['Steuerbescheid', 'Buchhaltung', '20261115T080000Z'], ['Angebot Elektriker', 'Zuhause.Flur', '20261107T080000Z'], ['Rückmeldung Agentur', 'Website', null]]
  wait.forEach(([d, p, s]) => tasks.push(mk(d, { project: p, tags: ['waiting'], scheduled: s, urgency: 1.5 })))
  ;['Japanisch-Kurs suchen', 'Fahrradtour an der Mosel planen', 'Podcast-Konzept skizzieren', 'Werkbank bauen', 'Buch über Wissensarbeit schreiben'].forEach((d) => tasks.push(mk(d, { tags: ['someday'], urgency: 0.3 })))
  ;[['Wochenplan aufschreiben', '20261031T074500Z'], ['Zahnarzttermin vereinbaren', '20261031T081000Z'], ['Newsletter-Abo kündigen', '20261031T082000Z']].forEach(([d, e]) => tasks.push(mk(d, { status: 'completed', tags: ['@computer'], end: e, urgency: 0 })))
  return tasks
}
const realProjects = [
  { name: 'Kunde-A.Workshop', outcome: 'Workshop ist gehalten und nachbereitet', status: 'active' },
  { name: 'Kunde-A.Angebot', outcome: 'Angebot ist unterschrieben', status: 'active' },
  { name: 'Kunde-A.Rechnung', outcome: 'Rechnungen für Oktober sind bezahlt', status: 'active' },
  { name: 'Website', outcome: 'Neue Website bringt Anfragen', status: 'active' },
  { name: 'Buchhaltung', outcome: 'Oktober ist gebucht', status: 'active' },
  { name: 'Quartalsplanung', outcome: 'Ziele für Q1 stehen', status: 'active' },
  { name: 'Zuhause.Flur', outcome: 'Flur ist eingerichtet', status: 'active' },
  { name: 'Zuhause.Keller', outcome: 'Keller ist aufgeräumt', status: 'active' },
  { name: 'Weiterbildung', outcome: 'Kurs für 2027 ist gebucht', status: 'active' },
]

export const TASKS = VOLUME === 'real' ? realVolume() : demoTasks
export const PROJECTS = VOLUME === 'real' ? realProjects : DEMO_PROJECTS
/** The context setting (Android: UI prefs, web: Einstellungen). Sector order follows it. */
export const CONTEXTS = VOLUME === 'real' ? ['@home', '@computer', '@work', '@business'] : DEMO_CONTEXTS

// ---------- dates (Europe/Berlin calendar days, like Android's DueBoundary) ----------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtTime = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export const dayOf = (tw) => (tw ? fmt.format(parseTw(tw)) : null)
const dayDate = (day) => new Date(day + 'T12:00:00Z')
const diffDays = (a, b) => Math.round((dayDate(a) - dayDate(b)) / 86400000)
export const addDays = (day, n) => { const d = dayDate(day); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const dayToTw = (day) => (day ? day.replace(/-/g, '') + 'T080000Z' : null)
export const shortDay = (day) => { const d = dayDate(day); return `${WD[d.getUTCDay()]} ${day.slice(8, 10)}.${day.slice(5, 7)}.` }
export const longToday = () => { const d = dayDate(TODAY); return `${WD_LONG[d.getUTCDay()]}, ${+TODAY.slice(8, 10)}. ${MONTHS[+TODAY.slice(5, 7) - 1]}` }
export const timeOf = (tw) => fmtTime.format(parseTw(tw))

export function relDay(day) {
  const d = diffDays(day, TODAY)
  if (d === 0) return 'heute'
  if (d === 1) return 'morgen'
  if (d === -1) return 'gestern'
  return shortDay(day)
}
export const isOverdue = (t) => !!t.due && dayOf(t.due) < TODAY
export const isDueToday = (t) => !!t.due && dayOf(t.due) === TODAY
export const isDueSoon = (t) => !!t.due && diffDays(dayOf(t.due), TODAY) <= 7
/** Follow-up day of a waiting item: `scheduled` only (`wait` is the tickler and hides the task). */
export const followUpDay = (t) => dayOf(t.scheduled)
export const followUpDue = (t) => { const d = followUpDay(t); return !!d && d <= TODAY }

export function dueLabel(t) {
  if (!t.due) return null
  const d = dayOf(t.due)
  if (d < TODAY) return { text: `überfällig seit ${relDay(d)}`, tone: 'overdue' }
  if (d === TODAY) return { text: 'fällig heute', tone: 'today' }
  return { text: `fällig ${relDay(d)}`, tone: diffDays(d, TODAY) <= 3 ? 'soon' : 'later' }
}
export function capturedLabel(t) {
  const d = dayOf(t.entry)
  const delta = diffDays(d, TODAY)
  return delta >= -1 ? `${relDay(d)} ${timeOf(t.entry)}` : shortDay(d)
}

// ---------- lists (the server's rules: inventory 1.2) ----------
const has = (t, tag) => tagParts(t).includes(tag)
export const isNext = (t) => t.status === 'pending' && !has(t, 'waiting') && !has(t, 'someday') && (has(t, 'next') || contextsOf(t).length > 0)
export function lists(tasks) {
  const open = tasks.filter((t) => t.status === 'pending')
  return {
    inbox: open.filter((t) => !t.project && tagParts(t).length === 0).sort((a, c) => (c.entry > a.entry ? 1 : -1)), // newest first on both platforms
    next: open.filter(isNext).sort((a, c) => c.urgency - a.urgency),
    waiting: open.filter((t) => has(t, 'waiting')).sort((a, c) => (followUpDue(c) - followUpDue(a)) || ((followUpDay(a) || '9') < (followUpDay(c) || '9') ? -1 : 1)),
    someday: open.filter((t) => has(t, 'someday')),
    done: tasks.filter((t) => t.status === 'completed'),
  }
}

/** Contexts the app knows: the context setting first, then any other context found on open tasks. */
export function knownContexts(tasks, order = CONTEXTS) {
  const seen = new Set(order)
  const extra = []
  for (const t of tasks) if (t.status === 'pending') for (const c of contextsOf(t)) if (!seen.has(c)) { seen.add(c); extra.push(c) }
  return [...order, ...extra.sort()]
}

/** Context filter, unified rule: the task carries the context or no context at all. NO_CTX = only tasks without one. */
export const matchesContext = (t, ctx) => !ctx || (ctx === NO_CTX ? contextsOf(t).length === 0 : contextsOf(t).length === 0 || contextsOf(t).includes(ctx))

// ---------- rings: explicit fields, not Taskwarrior's score ----------
/** Urgency without the constant +next coefficient; orders beads inside a ring. */
export const orbitScore = (t) => t.urgency - (has(t, 'next') && t.urgency >= 15 ? 15 : 0)
/**
 * Jetzt: overdue, due today, running or priority H. Bald: due within seven days or priority M.
 * Später: the rest. Read from fields Uli sets, so a passed `scheduled` date (Taskwarrior adds +5)
 * no longer decides the ring.
 */
export function ringOf(t) {
  if (isOverdue(t) || isDueToday(t) || t.start || t.priority === 'H') return 0
  if (isDueSoon(t) || t.priority === 'M') return 1
  return 2
}
export const needsAttention = (t) => isOverdue(t) || isDueToday(t) || (has(t, 'waiting') && followUpDue(t))

export function projectStats(tasks, projects) {
  const open = tasks.filter((t) => t.status === 'pending')
  return projects.map((p) => {
    const mine = open.filter((t) => t.project === p.name)
    const next = mine.filter(isNext)
    const waiting = mine.filter((t) => has(t, 'waiting'))
    const someday = mine.filter((t) => has(t, 'someday'))
    const stalled = p.status === 'active' && next.length === 0 && waiting.length === 0
    return { ...p, open: mine.length, next: next.length, waiting: waiting.length, someday: someday.length, stalled }
  })
}

// ---------- layout ----------
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a))
/** How many beads fit side by side on an arc (world units), capped. */
const capacity = (arc, cap) => Math.max(1, Math.min(cap, Math.floor((arc - 0.34) / 0.28) + 1))

/**
 * Sectors: only contexts with open next actions (or a stalled-project ghost), in the order of the
 * context setting, starting at the front boundary and running clockwise. Width = minSector plus a
 * share of the rest weighted by count. The label angle keeps clear of the tray at the front.
 */
export function sectorsFor(tasks, ghosts = [], contextOrder = CONTEXTS) {
  const L = lists(tasks)
  const order = knownContexts(tasks, contextOrder)
  const count = new Map()
  for (const t of L.next) for (const c of contextsOf(t)) count.set(c, (count.get(c) || 0) + 1)
  for (const g of ghosts) if (g.ctx && !count.has(g.ctx)) count.set(g.ctx, 0)
  const ctxs = order.filter((c) => count.has(c))
  const n = ctxs.length
  if (!n) return []
  const min = Math.min(GEO.minSector, (2 * Math.PI) / n)
  const total = ctxs.reduce((s, c) => s + Math.max(1, count.get(c)), 0)
  const free = 2 * Math.PI - n * min
  let a = 0
  return ctxs.map((ctx, i) => {
    const span = min + (free * Math.max(1, count.get(ctx))) / total
    const a0 = a, a1 = a - span
    a = a1
    const mid = (a0 + a1) / 2
    let labelA = norm(mid)
    if (Math.abs(labelA) < 0.62) labelA = (labelA < 0 ? -1 : 1) * 0.62
    if (n === 1) labelA = Math.PI
    return { i, ctx, a0, a1, mid, span, labelA, count: count.get(ctx) || 0 }
  })
}

/**
 * Bead layout: polar positions (a, r) for every bead plus sector metadata and "+N" markers.
 * kinds: 'next' (glazed, on an urgency ring in its context sector, or on the hub without context),
 * 'waiting' (hollow, on the outer ring; only when the follow-up is due), 'inbox' (raw clay, tray).
 * `more` holds the "+N" markers that stand for the rest of a cell; clicking one filters the list.
 */
export function layoutOrbit(tasks, ghosts = [], contextOrder = CONTEXTS) {
  const L = lists(tasks)
  const sectors = sectorsFor(tasks, ghosts, contextOrder)
  const sIdx = new Map(sectors.map((s) => [s.ctx, s.i]))
  const beads = []
  const more = []
  const ghostOut = []
  const cells = new Map()
  const push = (key, item) => { if (!cells.has(key)) cells.set(key, []); cells.get(key).push(item) }
  for (const t of L.next) {
    const c = contextsOf(t).find((x) => sIdx.has(x))
    push(c == null ? 'hub' : `${sIdx.get(c)}:${ringOf(t)}`, t)
  }
  for (const g of ghosts) {
    const si = g.ctx ? sIdx.get(g.ctx) : undefined
    push(si == null ? 'hub' : `${si}:${g.ring}`, { ghost: true, project: g.project, score: g.score ?? -99 })
  }
  const sc = (x) => (x.ghost ? x.score : orbitScore(x))
  const place = (items, centre, r, arcSpan, cap, info) => {
    items.sort((a, c) => sc(c) - sc(a))
    // at most `cap` beads, then one "+N" marker; on a short arc fewer slots fit
    const fit = capacity(arcSpan * r, cap + 1)
    const k = items.length <= Math.min(cap, fit) ? items.length : Math.max(0, Math.min(cap, fit - 1))
    const shown = items.slice(0, k)
    const rest = items.slice(k)
    const slots = shown.length + (rest.length ? 1 : 0)
    const step = Math.min(0.32 / r, Math.max(0.0001, arcSpan * r - 0.34) / r / Math.max(slots - 1, 1))
    const at = (j) => centre - (j - (slots - 1) / 2) * step
    shown.forEach((t, j) => {
      const a = at(j)
      if (t.ghost) { ghostOut.push({ project: t.project, a, r, ...info }); return }
      beads.push({ id: t.id, kind: 'next', a, r, live: !!t.start, attention: needsAttention(t), overdue: isOverdue(t), project: t.project, ctxs: contextsOf(t), ...info })
    })
    if (rest.length) more.push({ n: rest.length, ids: rest.filter((x) => !x.ghost).map((x) => x.id), a: at(slots - 1), r, ...info })
  }
  for (const [key, items] of cells) {
    if (key === 'hub') { place(items, 0, GEO.hubRing, 2.2, 4, { cell: 'hub', sector: -1, ring: -1, ctx: null, hub: true }); continue }
    const [si, ring] = key.split(':').map(Number)
    const s = sectors[si]
    place(items, s.mid, GEO.rings[ring], s.span - 0.12, GEO.cellMax, { cell: key, sector: si, ring, ctx: s.ctx })
  }
  // Waiting: only follow-ups that are due become beads (they are actions now); the rest is a
  // count. A due follow-up sits on the outer ring in its own context's sector, else in its
  // project's sector, else on the hub with the other things you can do anywhere.
  const projCtx = new Map()
  for (const t of L.next) if (t.project && !projCtx.has(t.project)) { const c = contextsOf(t).find((x) => sIdx.has(x)); if (c) projCtx.set(t.project, c) }
  const dueW = L.waiting.filter(followUpDue)
  const wCells = new Map()
  for (const t of dueW) {
    const c = contextsOf(t).find((x) => sIdx.has(x)) || projCtx.get(t.project)
    if (!c) { beads.push({ id: t.id, kind: 'waiting', a: 0, r: GEO.hubRing, live: false, attention: true, project: t.project, ctx: null, ctxs: [], sector: -1, ring: 3, hub: true, cell: 'hub' }); continue }
    const key = `w${sIdx.get(c)}`
    if (!wCells.has(key)) wCells.set(key, [])
    wCells.get(key).push(t)
  }
  for (const [key, ts] of wCells) {
    const si = +key.slice(1)
    const s = sectors[si]
    const k = capacity(s.span * GEO.wait, 3)
    const shown = ts.length > k ? ts.slice(0, k - 1) : ts
    const slots = shown.length + (ts.length > k ? 1 : 0)
    const step = 0.32 / GEO.wait
    // beside the sector label (which sits on the same angle further out), inside the sector
    const norm0 = (a) => Math.atan2(Math.sin(a), Math.cos(a))
    const inSector = (a) => { let x = a; while (x > s.a0) x -= 2 * Math.PI; while (x < s.a1) x += 2 * Math.PI; return x <= s.a0 && x >= s.a1 }
    const c0 = [s.labelA - 0.42, s.labelA + 0.42].find(inSector) ?? s.mid
    const at = (j) => norm0(c0) - (j - (slots - 1) / 2) * step
    shown.forEach((t, j) => beads.push({ id: t.id, kind: 'waiting', a: at(j), r: GEO.wait, live: false, attention: true, project: t.project, ctx: s.ctx, ctxs: contextsOf(t), sector: si, ring: 3, cell: key }))
    if (ts.length > k) more.push({ n: ts.length - shown.length, ids: ts.slice(k - 1).map((t) => t.id), a: at(slots - 1), r: GEO.wait, cell: key, sector: si, ring: 3, ctx: s.ctx, waiting: true })
  }
  // hub beads (next without context, due follow-ups without a sector) sit on the front of the
  // hub, right above their label in the front column (ohne Kontext · Jetzt · Bald · Später)
  const hubBeads = beads.filter((b) => b.hub)
  if (hubBeads.length) {
    const hubMore = more.find((m) => m.cell === 'hub')
    const slots = hubBeads.length + (hubMore ? 1 : 0)
    const step = 0.3 / GEO.hubRing
    hubBeads.forEach((b, j) => { b.a = (j - (slots - 1) / 2) * step })
    if (hubMore) hubMore.a = (slots - 1 - (slots - 1) / 2) * step
  }
  // Inbox: the tray at the front rim, newest first from the left, never wider than the tray.
  const inb = L.inbox
  const kIn = Math.min(inb.length, GEO.trayMax)
  const slotsIn = kIn + (inb.length > kIn ? 1 : 0)
  const stIn = Math.min(0.3 / GEO.tray, (2 * GEO.trayArc) / Math.max(slotsIn - 1, 1))
  const atIn = (j) => (j - (slotsIn - 1) / 2) * stIn
  inb.slice(0, kIn).forEach((t, j) => beads.push({ id: t.id, kind: 'inbox', a: atIn(j), r: GEO.tray, sector: -1, ring: 4, attention: false, ctxs: [], cell: 'tray' }))
  if (inb.length > kIn) more.push({ n: inb.length - kIn, ids: inb.slice(kIn).map((t) => t.id), a: atIn(slotsIn - 1), r: GEO.tray, cell: 'tray', sector: -1, ring: 4, ctx: null, tray: true })
  const hubCount = L.next.filter((t) => !contextsOf(t).some((c) => sIdx.has(c))).length
  return { beads, more, sectors, lists: L, ghosts: ghostOut, hubCount, waitingCount: L.waiting.length, waitingDue: dueW.length }
}

export const polar = (a, r) => ({ x: r * Math.sin(a), z: r * Math.cos(a) })

/** One-line, plain-language summary of the orbit for the view header (German, calm). */
export function orbitSummary(tasks, ctx) {
  const L = lists(tasks)
  const next = L.next.filter((t) => matchesContext(t, ctx))
  const inner = next.filter((t) => ringOf(t) === 0)
  const over = L.next.filter(isOverdue)
  const words = ['Keine', 'Eine', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn']
  const n = inner.length
  const head = words[n] || String(n)
  const rest = n === 1 ? 'Aufgabe liegt dir am nächsten' : 'Aufgaben liegen dir am nächsten'
  const tail = over.length ? (over.length === 1 ? ', eine ist überfällig.' : `, ${over.length} sind überfällig.`) : '.'
  return { accent: head, text: ` ${rest}${tail}` }
}

/** Project names with dots nest (home.garden): parent path and leaf for display. */
export function projectParts(name) {
  const parts = String(name || '').split('.')
  return { parent: parts.slice(0, -1).join(' › '), leaf: parts[parts.length - 1], depth: parts.length - 1 }
}
