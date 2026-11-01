/**
 * Nächste, in sections: Fällig first, then Jetzt · Bald · Später — computed from fields
 * the user sets (due, priority, start, a plan for today), never from Taskwarrior's
 * urgency score, which only orders a section and is never shown.
 *
 * Ported from the prototype (`06-kombination/rules.js` `ringOf`/`plannedToday`,
 * `store.js` `lists()`, `web.js` the merged Fällig heading). Pure.
 */

import { NO_CONTEXT } from './contexts.js'
import { dayOf, plusDays } from './dates.js'
import { contextTagsOf, isInbox, isNext, isWaiting } from './gtdRules.js'

/**
 * "Planned for today": due today or earlier, planned for today (`scheduled` today or
 * earlier — except in Warten auf, where `scheduled` is the follow-up day), or running.
 *
 * @param {object} t
 * @param {string} today YYYY-MM-DD
 */
export function plannedToday(t, today) {
  const due = dayOf(t.due)
  const scheduled = dayOf(t.scheduled)
  return (!!due && due <= today) || (!!scheduled && !isWaiting(t) && scheduled <= today) || !!t.start
}

/**
 * Jetzt  overdue, due today, running, priority H, or planned for today
 * Bald   due within seven days, or priority M
 * Später the rest
 *
 * @returns {'jetzt'|'bald'|'spaeter'}
 */
export function ringOf(t, today) {
  const due = dayOf(t.due)
  if (t.priority === 'H' || plannedToday(t, today)) return 'jetzt'
  if ((due && due <= plusDays(today, 7)) || t.priority === 'M') return 'bald'
  return 'spaeter'
}

/**
 * Whether a todo shows under a context filter. Lenient: a context shows its own todos
 * and those without any context (they could be done anywhere); "ohne Kontext" shows only
 * the latter. No filter shows everything.
 *
 * @param {object} t
 * @param {string|null} ctx `'@x'`, `NO_CONTEXT`, or null for all
 */
export function inContext(t, ctx) {
  if (!ctx) return true
  const contexts = contextTagsOf(t)
  if (ctx === NO_CONTEXT) return contexts.length === 0
  return contexts.length === 0 || contexts.includes(ctx)
}

/**
 * Running first, then priority H, then urgency (highest first): the order inside Nächste's
 * sections, and of Irgendwann and "ohne Liste".
 */
export const byWeight = (a, b) =>
  (b.start ? 1 : 0) - (a.start ? 1 : 0) ||
  (b.priority === 'H' ? 1 : 0) - (a.priority === 'H' ? 1 : 0) ||
  (b.urgency || 0) - (a.urgency || 0)

/** Oldest due first. */
const byDue = (a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0)

/**
 * The sections of Nächste.
 *
 * - `faellig`: every open todo outside the Inbox that is due today or overdue and passes
 *   the context filter — whatever its list, oldest due first.
 * - `faelligAndere`: with a context filter, the due todos of other contexts, kept
 *   visible apart and unranked; empty without a filter.
 * - `dueMerged`: the filtered context has nothing due but other contexts do. The view
 *   then shows `faelligAndere` under the one "Fällig" heading with the note
 *   "andere Kontexte", never "Nichts fällig" above them.
 * - `jetzt`, `bald`, `spaeter`: the Nächste todos (F4: not also waiting or someday)
 *   that pass the filter and are not in Fällig; a todo appears once, Fällig wins.
 *
 * @param {{tasks: object[], today: string}} snapshot the open, visible tasks and the server's today
 * @param {string|null} [ctx] the context filter (see `inContext`)
 */
export function nextSections({ tasks, today }, ctx = null) {
  const dueAll = tasks
    .filter((t) => !isInbox(t) && t.due && dayOf(t.due) <= today)
    .sort(byDue)
  const faellig = dueAll.filter((t) => inContext(t, ctx))
  const faelligAndere = ctx ? dueAll.filter((t) => !inContext(t, ctx)) : []
  const dueIds = new Set(dueAll.map((t) => t.uuid))
  const rings = { jetzt: [], bald: [], spaeter: [] }
  for (const t of tasks.filter((x) => isNext(x) && inContext(x, ctx) && !dueIds.has(x.uuid)).sort(byWeight)) {
    rings[ringOf(t, today)].push(t)
  }
  return {
    faellig,
    faelligAndere,
    dueMerged: faellig.length === 0 && faelligAndere.length > 0,
    ...rings,
  }
}

/** The follow-up day of a waiting todo: `scheduled`, else the `wait` that hides it. */
export const followUpOf = (t) => dayOf(t.scheduled || t.wait)

/**
 * Warten auf in sections (06 `waitingSplit`): `due` — the follow-up day has come
 * (Nachhaken); `soon` — within the next seven days; `later` — later or without a day.
 * The input order is kept inside each section.
 *
 * @param {object[]} tasks the waiting todos
 * @param {string} today YYYY-MM-DD
 * @returns {{due: object[], soon: object[], later: object[]}}
 */
export function waitingSections(tasks, today) {
  const out = { due: [], soon: [], later: [] }
  for (const t of tasks) {
    const day = followUpOf(t)
    if (day && day <= today) out.due.push(t)
    else if (day && day <= plusDays(today, 7)) out.soon.push(t)
    else out.later.push(t)
  }
  return out
}
