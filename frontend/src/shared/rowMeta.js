/**
 * What a row says besides its title (06 `rowMeta`, `dueInfo`, `followInfo`, `entryInfo`):
 * the mono meta parts per list, and the row's accessible name, which is Android's pinned row
 * text `<Beschreibung>, <Status>, ID <8>`. Days are the server's (`dates.js`), never the
 * browser's. Pure.
 */

import { dayOf, formatDay, parseStamp, plusDays, timeOf } from './dates.js'
import { contextTagsOf, isNext, isWaiting, listOf } from './gtdRules.js'
import { t } from './i18n.js'
import { followUpOf, plannedToday } from './sections.js'

/** `30.10.` */
export function dayMonth(day) {
  const [, month, date] = day.split('-')
  return `${date}.${month}.`
}

/**
 * @returns {null|{text: string, tone: 'overdue'|'today'|'soon'|'', status?: string}}
 *   `status` is the word Android's row text uses for an overdue or due-today todo
 */
export function dueInfo(task, today) {
  const due = dayOf(task.due)
  if (!due) return null
  if (due < today) return { text: t('due.overdue', { d: dayMonth(due) }), tone: 'overdue', status: t('status.overdue') }
  if (due === today) return { text: t('due.today'), tone: 'today', status: t('status.dueToday') }
  if (due === plusDays(today, 1)) return { text: t('due.tomorrow'), tone: 'soon' }
  return { text: formatDay(due), tone: due <= plusDays(today, 7) ? 'soon' : '' }
}

/**
 * The follow-up of a waiting todo. "Nachhaken" only once its day has come, always with the
 * yellow ring (`due`); a later day reads "Wiedervorlage" (Android P10).
 *
 * @returns {{text: string, tone: 'follow'|'', due: boolean}}
 */
export function followInfo(task, today) {
  const day = followUpOf(task)
  if (day && day <= today) {
    return { text: day === today ? t('follow.today') : t('follow.since', { d: dayMonth(day) }), tone: 'follow', due: true }
  }
  if (day) return { text: t('follow.later', { d: formatDay(day) }), tone: '', due: false }
  const since = dayOf(task.entry)
  return { text: since ? t('follow.none', { d: dayMonth(since) }) : '', tone: '', due: false }
}

/** When a todo was captured: `heute 09:12`, `gestern 18:40`, else `Fr 30.10.`; `gerade` before the server named it. */
export function entryInfo(task, today) {
  const day = dayOf(task.entry)
  if (!day) return t('done.now')
  const time = timeOf(parseStamp(task.entry))
  if (day === today) return t('entry.today', { t: time })
  if (day === plusDays(today, -1)) return t('entry.yesterday', { t: time })
  return formatDay(day)
}

/** The context column: the first context and `+n` for more; "ohne Kontext" for a Nächste todo without one. */
export function contextText(task) {
  const contexts = contextTagsOf(task)
  if (contexts.length > 1) return `${contexts[0]} +${contexts.length - 1}`
  if (contexts.length === 1) return contexts[0]
  return isNext(task) ? t('ctx.none') : ''
}

/** "für heute": a Nächste todo planned for today by its `scheduled` day, with no due day to show instead. */
export const plannedForToday = (task, today) =>
  !task.due && isNext(task) && !!task.scheduled && plannedToday(task, today)

/** A done todo's time: `heute 08:45` today, else its day. */
function doneWhen(task, today) {
  const day = dayOf(task.end)
  if (!day) return t('done.now')
  return day === today ? t('entry.today', { t: timeOf(parseStamp(task.end)) }) : formatDay(day)
}

/**
 * The meta parts of a row, in column order. An empty `text` keeps its column on wide
 * screens and is dropped on the phone.
 *
 * @param {object} task
 * @param {'inbox'|'next'|'waiting'|'someday'|'done'} kind which list's columns
 * @param {string} today YYYY-MM-DD
 * @returns {Array<{text: string, tone: string, ring?: boolean}>}
 */
export function metaOf(task, kind, today) {
  const project = { text: task.project || '', tone: '' }
  const notes = task.annotations?.length || 0
  switch (kind) {
    case 'inbox':
      return [
        { text: notes ? t('row.notes', { n: notes }) : '', tone: '' },
        { text: t('row.captured', { d: entryInfo(task, today) }), tone: '' },
      ]
    case 'waiting': {
      const f = followInfo(task, today)
      return [project, { text: f.text, tone: f.tone, ring: f.due }]
    }
    case 'someday': {
      const since = dayOf(task.entry)
      return [project, { text: since ? t('row.since', { d: dayMonth(since) }) : '', tone: '' }]
    }
    case 'done':
      return [project, { text: contextTagsOf(task).join(' '), tone: '' }, { text: doneWhen(task, today), tone: '' }]
    default: {
      const due = dueInfo(task, today)
      const planned = !due && plannedForToday(task, today)
      return [
        project,
        { text: contextText(task), tone: contextTagsOf(task).length ? '' : 'noctx' },
        { text: due ? due.text : planned ? t('row.planned') : '', tone: due ? due.tone : planned ? 'planned' : '' },
      ]
    }
  }
}

/** The status word of Android's row text. */
function statusWord(task, today) {
  const due = dueInfo(task, today)
  if (due?.status) return due.status
  if (isWaiting(task) && followInfo(task, today).due) return t('status.follow')
  return t(`status.${listOf(task)}`)
}

/** The row's accessible name: `<Beschreibung>, <Status>, ID <8>` (Android's pinned row text). */
export const rowLabel = (task, today) => `${task.description}, ${statusWord(task, today)}, ID ${task.uuid.slice(-8)}`
