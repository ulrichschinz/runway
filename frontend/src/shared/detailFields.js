/**
 * What the task detail offers for a todo, and the PUT body a field edit sends (plan M7,
 * brief 0053). Pure: no Vue, no store.
 *
 * Field edits keep the old form's rule (`taskPayload.js`): an emptied field is `''` and
 * clears it, an untouched one is left out, so a date nobody changed is never rewritten.
 * Two things differ from the old form: `tags` are never sent here (the full set would undo
 * a concurrent writer's tags; tags travel as deltas, `tagPayload` / `contextPayload` /
 * `listPayload`), and `depends` only when it changed.
 *
 * A recurring todo keeps its due day and its rhythm: Taskwarrior refuses to clear either
 * ("You cannot remove the due date from a recurring task", 400), so the detail does not
 * offer it and `fieldEdit` never sends it.
 */

import { dayOf, formatDay, parseStamp, timeOf } from './dates.js'
import { STATUS_TAGS, allTagParts, isAddableTag, listOf, planPayload } from './gtdRules.js'
import { buildTaskPayload } from './taskPayload.js'

/** The rhythms offered as toggles; any other value Taskwarrior takes can be typed. */
export const RECUR_PRESETS = ['daily', 'weekly', 'monthly', 'yearly']

/**
 * The editable fields of a todo as the form holds them: days as `YYYY-MM-DD` in server
 * time (a due day stored as local midnight is `…T230000Z` in winter), '' when unset.
 */
export function formOf(t) {
  return {
    description: t.description || '',
    project: t.project || '',
    priority: t.priority || null,
    due: dayOf(t.due) || '',
    scheduled: dayOf(t.scheduled) || '',
    wait: dayOf(t.wait) || '',
    until: dayOf(t.until) || '',
    recur: t.recur || '',
    depends: [...(t.depends || [])],
  }
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x))

/**
 * The PUT body for a change of one or more fields.
 *
 * @param {object} t the todo as shown
 * @param {object} changes form fields (see `formOf`) with their new values
 * @returns {object|null} the body, or null when nothing would change
 */
export function fieldEdit(t, changes) {
  const before = formOf(t)
  const after = { ...before, ...changes }
  const body = buildTaskPayload(after, before)
  delete body.tags
  if (sameSet(after.depends, before.depends)) delete body.depends
  // A description can be replaced, never cleared; an unchanged one is not sent.
  if (!body.description || body.description === before.description.trim()) delete body.description
  if (t.recur) {
    if (body.due === '') delete body.due
    if (body.recur === '') delete body.recur
  }
  return Object.keys(body).length ? body : null
}

/**
 * Which fields the detail shows for a todo.
 *
 * - `plan`: the "für heute" toggle, where `t` plans (not in Inbox, Warten auf, Irgendwann).
 * - `scheduled`: what its `scheduled` day means — the follow-up day in Warten auf
 *   (`'follow'`, "Nachhaken"), a planned day elsewhere (`'plan'`, "Geplant").
 * - `planned`: planned for today or earlier (what `t` would take off the plan).
 * - `clearDue`, `clearRecur`: false on a recurring todo.
 *
 * @param {object} t
 * @param {string} today YYYY-MM-DD, the server's
 */
export function detailFields(t, today) {
  const recurring = !!t.recur
  return {
    list: listOf(t),
    plan: planPayload(t, today) !== null,
    scheduled: listOf(t) === 'waiting' ? 'follow' : 'plan',
    planned: !!dayOf(t.scheduled) && dayOf(t.scheduled) <= today,
    clearDue: !recurring,
    clearRecur: !recurring,
  }
}

/** The todo's tags that are neither a list (next, waiting, someday) nor a context. */
export function extraTagsOf(t) {
  return [...new Set(allTagParts(t))].filter((part) => !STATUS_TAGS.includes(part) && !part.startsWith('@'))
}

/**
 * A tag typed into the detail: trimmed, Taskwarrior's habitual leading `+` dropped.
 *
 * @returns {{tag: string}|{error: string}} `error` is a message key
 */
export function readTag(raw, t = null) {
  const tag = String(raw).trim().replace(/^\+/, '')
  if (STATUS_TAGS.includes(tag)) return { error: 'd.tagList' }
  if (!tag || tag === '@' || !isAddableTag(tag)) return { error: 'd.tagBad' }
  // The field adds: a tag (or context) the todo already has is not toggled off.
  if (t && allTagParts(t).includes(tag)) return { error: 'd.tagHas' }
  return { tag }
}

const DAY_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * What a date field holds, and whether it may be sent. A browser's date field reports every
 * keystroke: an incomplete day as `''` with `badInput`, a year being typed as `0002`, `0020`,
 * `0202`. Only a whole day with a four-digit year from 1900 on, or a field emptied on purpose
 * (`''` without `badInput`), is a value to send.
 *
 * @param {string} raw the input's `value`
 * @param {boolean} [badInput] the input's `validity.badInput`
 * @returns {{day: string}|null} `day` is `YYYY-MM-DD` or `''` (clear); null: nothing to send yet
 */
export function readDay(raw, badInput = false) {
  const value = String(raw ?? '')
  if (value === '') return badInput ? null : { day: '' }
  const m = DAY_SHAPE.exec(value)
  if (!m || Number(m[1]) < 1900) return null
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]) ? { day: value } : null
}

/**
 * A todo hidden by a future `wait` ("Zurückstellen"): the server leaves it out of every list,
 * the detail still shows it so the deferral can be undone.
 *
 * @param {object} t
 * @param {string} today YYYY-MM-DD
 */
export function isDeferred(t, today) {
  if (!t || t.status === 'completed' || t.status === 'deleted') return false
  const wait = dayOf(t.wait)
  return !!wait && !!today && wait > today
}

/** The day a deferred todo comes back, as the detail says it ('' when it is not deferred). */
export const deferredUntil = (t, today) => (isDeferred(t, today) ? formatDay(dayOf(t.wait)) : '')

/** Since when a started todo runs: its time today, else its day ('' when it does not run). */
export function runningSince(t, today) {
  const day = dayOf(t.start)
  if (!day) return ''
  return day === today ? timeOf(parseStamp(t.start)) : formatDay(day)
}

/**
 * Whether an Enter in a text field means "save" or "add": not the Enter that confirms an IME
 * conversion (`isComposing`, or Safari's keyCode 229 right after it), which only ends the
 * composition — the same guard `ownsKey` (`commands.js`) keeps for the page's keymap.
 *
 * @param {{key: string, isComposing?: boolean, keyCode?: number}} event
 */
export function committingEnter(event) {
  return event.key === 'Enter' && !event.isComposing && event.keyCode !== 229
}
