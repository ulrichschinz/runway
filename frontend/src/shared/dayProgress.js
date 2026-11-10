/**
 * The day's progress behind the Tageslinse: "3 von 7 heute · 1 zusätzlich".
 *
 * The stable rule (prototype 01, ported from `06-kombination/rules.js`): the denominator
 * moves only when the plan moves (`t` plans a todo for today, a due date arrives), never
 * because something unplanned was done — that shows apart, as "zusätzlich".
 *
 *   planned = open todos in Nächste or "ohne Liste" that are planned for today
 *   done    = todos done today that were planned, by the same test (`countsAsPlanned`)
 *   total   = done + planned          extra = done today, never planned
 *
 * Correction to 06 (brief 0048): 06 counted a done todo as planned by `plannedToday`
 * alone, without the list test the open side uses. Ticking an Inbox, Warten-auf or
 * Irgendwann todo that is due today then grew the denominator ("0 von 1" became
 * "1 von 2"). Both sides now use `countsAsPlanned`, so it shows as "zusätzlich".
 *
 * F6 (answered in brief 0048): completing a running todo drops its `start`. A todo that
 * counted as planned only because it was running would turn into "zusätzlich" on the
 * tick and shrink the denominator. The outbox hold therefore records `plannedAtHold`
 * (`countsAsPlanned` at the moment of the tick) on the done todo, and it counts as
 * planned, so the hold and the count can never disagree.
 * Pure.
 */

import { isInbox, isSomeday, isWaiting } from './gtdRules.js'
import { t } from './i18n.js'
import { plannedToday } from './sections.js'

/**
 * Whether a todo counts toward today's plan: planned for today and not in the Inbox,
 * Warten auf or Irgendwann. The value the outbox hold records as `plannedAtHold`.
 *
 * @param {object} x
 * @param {string} today YYYY-MM-DD, the server's
 */
export const countsAsPlanned = (x, today) =>
  !isInbox(x) && !isSomeday(x) && !isWaiting(x) && plannedToday(x, today)

/**
 * @param {object[]} open the open, visible todos
 * @param {object[]} doneToday the todos completed today (including held ticks)
 * @param {string} today YYYY-MM-DD, the server's
 * @returns {{done: number, planned: number, extra: number, total: number, level: number}}
 *   `level` is done / total (0 when nothing is planned)
 */
export function dayProgress(open, doneToday, today) {
  const planned = open.filter((x) => countsAsPlanned(x, today)).length
  const done = doneToday.filter((x) => x.plannedAtHold === true || countsAsPlanned(x, today)).length
  const extra = doneToday.length - done
  const total = done + planned
  return { done, planned, extra, total, level: total ? done / total : 0 }
}

/**
 * The caption under the lens. Never a `+1` form (judge point 3).
 *
 * @param {{done: number, total: number, extra: number}} p
 * @param {{short?: boolean}} [opts] short: without "heute", for the phone head
 * @returns {string} `3 von 7 heute · 1 zusätzlich`
 */
export function lensCaption(p, { short = false } = {}) {
  return lensCaptionParts(p, { short }).join('')
}

/**
 * The caption in its two parts, so a narrow head can wrap the second onto its own line (plan
 * M11, judge point 3: `3 von 7 heute` / `· 1 zusätzlich`, never `+1`).
 *
 * @param {{done: number, total: number, extra: number}} p
 * @param {{short?: boolean}} [opts]
 * @returns {[string, string]} the count and the extra part ('' without extra)
 */
export function lensCaptionParts(p, { short = false } = {}) {
  const base = t(short ? 'lens.short' : 'lens.cap', { done: p.done, total: p.total })
  return [base, p.extra ? t('lens.extra', { n: p.extra }) : '']
}
