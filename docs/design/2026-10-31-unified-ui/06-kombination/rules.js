// Pure GTD rules of proposal 06. No DOM, no state. Base: 03's rules.js (API-verified list moves with
// exact inverses), plus three grafts:
//   - 05 "never guess metadata": Nächste needs a context, Warten auf carries a follow-up day.
//   - 04 ring sections: Jetzt · Bald · Später from fields Uli sets, never from the urgency score.
//   - 01 the stable day-progress rule behind the Tageslinse.
// In the real apps this file becomes frontend/src/shared/listMoves.js + dayProgress.js (tested in
// frontend/tests/) and gtd/ListMoves.kt + gtd/DayProgress.kt on Android, run against the same vectors.
//
// The lists follow the server (api/app/services/task_service.py, inventory 1.2):
//   Inbox    = no tags at all and no project
//   Nächste  = +next (and not also +waiting or +someday)
//   Warten   = +waiting          Irgendwann = +someday
//   anything else is "ohne Liste": in a project only, or a context without a status tag

import { tagParts, contextsOf } from '../shared/data/tasks.js'

export const STATUS_TAGS = ['next', 'waiting', 'someday']
export const has = (t, tag) => tagParts(t).includes(tag)
export const isWaiting = (t) => has(t, 'waiting')
export const isSomeday = (t) => has(t, 'someday')
export const isNext = (t) => has(t, 'next') && !isWaiting(t) && !isSomeday(t)
export const isInbox = (t) => !t.project && tagParts(t).length === 0
export const listOf = (t) => isInbox(t) ? 'inbox' : isWaiting(t) ? 'waiting' : isSomeday(t) ? 'someday' : isNext(t) ? 'next' : 'none'

/** Raised when a move would have to guess metadata. The UI answers with the missing question. */
export class NeedsAnswer extends Error {
  constructor(what) { super(`needs ${what}`); this.what = what } // 'context'
}

/** A calendar day (YYYY-MM-DD, Europe/Berlin) as the 08:00 Taskwarrior timestamp the API stores. */
export const morningTw = (day) => day ? day.replace(/-/g, '') + 'T070000Z' : null // CET; the real helper reads the offset

/**
 * Clarify an Inbox item. to: 'next:@ctx' | 'waiting' | 'someday' | 'project:Name'.
 * opts: { ctx } for a project's first action, { followUp: 'YYYY-MM-DD' | '' } for Warten auf.
 * Nächste without a context throws NeedsAnswer('context'): the client asks, it never defaults.
 */
export function clarifyPayload(to, opts = {}) {
  const [kind, arg] = String(to).split(/:(.*)/s)
  if (kind === 'next') {
    if (!arg) throw new NeedsAnswer('context')
    return { tags_add: ['next', arg] }
  }
  if (kind === 'waiting') return opts.followUp ? { tags_add: ['waiting'], scheduled: opts.followUp } : { tags_add: ['waiting'] }
  if (kind === 'someday') return { tags_add: ['someday'] }
  if (kind === 'project') {
    if (!opts.ctx) throw new NeedsAnswer('context')
    return { project: arg, tags_add: ['next', opts.ctx] }
  }
  throw new Error(`unknown clarify target ${to}`)
}

/** Move between Nächste, Warten auf and Irgendwann: add the one status tag, remove the other two. */
export function listPayload(t, list) {
  if (!STATUS_TAGS.includes(list)) throw new Error(`not a list move: ${list}`)
  if (list === 'next' && contextsOf(t).length === 0) throw new NeedsAnswer('context')
  const raw = (tag) => t.tags.filter((x) => String(x).split(',').map((p) => p.trim()).includes(tag))
  const body = {
    tags_add: [list],
    tags_remove: STATUS_TAGS.filter((s) => s !== list).flatMap(raw),
  }
  // Leaving Warten auf: `scheduled` was the follow-up day, not a plan. Kept, it would count as
  // "für heute" in Jetzt and in the Tageslinse's denominator. The API clears it with ''
  // (backend/app/routers/tasks.py:129); the inverse restores it.
  if (isWaiting(t) && list !== 'waiting' && t.scheduled) body.scheduled = ''
  return body
}

/** Toggle one context. Never touches next, waiting or someday. */
export function contextPayload(t, ctx) {
  if (!contextsOf(t).includes(ctx)) return { tags_add: [ctx] }
  const rawTag = t.tags.find((x) => String(x).split(',').map((p) => p.trim()).includes(ctx))
  if (rawTag === ctx) return { tags_remove: [ctx] }
  // legacy "@a,@b" tag: remove the raw tag, add back the parts that stay (repairs the tag)
  const keep = String(rawTag).split(',').map((p) => p.trim()).filter((p) => p && p !== ctx)
  return { tags_remove: [rawTag], tags_add: keep }
}

/** The inverse of a clarify or list move, for Rückgängig: remove what was added, add back what was
 *  removed, restore project and follow-up. `before.scheduledDay` is the day before the move. */
export function inversePayload(before, body) {
  const out = {}
  const added = (body.tags_add || []).filter((tag) => !before.tags.includes(tag))
  const removed = (body.tags_remove || []).filter((tag) => before.tags.includes(tag))
  if (added.length) out.tags_remove = added
  if (removed.length) out.tags_add = removed
  if ('project' in body && body.project !== before.project) out.project = before.project ?? ''
  if ('scheduled' in body) out.scheduled = before.scheduledDay ?? ''
  return out
}

/** Apply a PUT body to a local copy the way the server does (used by the store and the tests). */
export function applyPayload(t, body) {
  const rm = new Set(body.tags_remove || [])
  const tags = t.tags.filter((x) => !rm.has(x))
  for (const tag of body.tags_add || []) if (!tags.includes(tag)) tags.push(tag)
  t.tags = tags
  if ('project' in body) t.project = body.project || null
  if ('scheduled' in body) t.scheduled = morningTw(body.scheduled)
  return t
}

/**
 * Nächste sections after Fällig (graft from 04): computed from fields Uli sets.
 *   Jetzt  = overdue, due today, running, priority H, or planned for today (T)
 *   Bald   = due within seven days, or priority M
 *   Später = the rest
 * `day(tw)` maps a timestamp to its Europe/Berlin calendar day; `today` is the server's today.
 */
export function ringOf(t, { day, today, plusDays }) {
  const due = t.due ? day(t.due) : null
  if ((due && due <= today) || t.start || t.priority === 'H' || plannedToday(t, { day, today })) return 'jetzt'
  if ((due && due <= plusDays(today, 7)) || t.priority === 'M') return 'bald'
  return 'spaeter'
}

/** "Planned for today": due today or earlier, marked for today (scheduled <= today, not a follow-up), or started. */
export function plannedToday(t, { day, today }) {
  return (!!t.due && day(t.due) <= today) || (!!t.scheduled && !isWaiting(t) && day(t.scheduled) <= today) || !!t.start
}

/**
 * The Tageslinse (graft from 01, stable rule). The denominator changes only when the plan changes
 * (T plans a todo for today, a due date arrives), never because something unplanned was done.
 *   total = open and planned + done today and planned;   extra = done today, never planned.
 */
export function dayProgress(open, doneToday, ctx) {
  const planned = open.filter((t) => !isInbox(t) && !isSomeday(t) && !isWaiting(t) && plannedToday(t, ctx)).length
  const done = doneToday.filter((t) => plannedToday(t, ctx)).length
  const extra = doneToday.length - done
  const total = done + planned
  return { done, planned, extra, total, level: total ? done / total : 0 }
}

/** Project names as the API accepts them (api/app/models.py:15-20). Returns a message key or ''. */
export function projectNameError(name, existing = []) {
  const n = String(name)
  if (!n.trim()) return 'proj.err.empty'
  if (n.length > 100) return 'proj.err.long'
  if (/[()"'\\:\/?#%\u0000-\u001f]/.test(n)) return 'proj.err.chars'
  if (/^[+\- ]/.test(n) || / $/.test(n)) return 'proj.err.edge'
  if (['overview', 'plans'].includes(n.toLowerCase())) return 'proj.err.reserved'
  if (existing.some((p) => p.toLowerCase() === n.toLowerCase())) return 'proj.err.exists'
  return ''
}
