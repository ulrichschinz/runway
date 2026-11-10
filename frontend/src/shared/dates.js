/**
 * Calendar days as the server counts them.
 *
 * Taskwarrior stores every date as a UTC stamp (`20261030T230000Z`) and reads a bare
 * `YYYY-MM-DD` as local midnight in the server's zone (plan F3). Every rule that asks
 * "is this today, overdue, this week" therefore compares **days in that zone**, never
 * instants and never the browser's zone. The API publishes `today` (`/gtd/summary`) but
 * not the zone itself (F7), so the zone is a constant here; a deployment in another zone
 * would mis-day rows (recorded in brief 0048).
 *
 * A day is always a `YYYY-MM-DD` string; strings of that shape compare in calendar order.
 */

export const SERVER_TZ = 'Europe/Berlin'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
/** A server-local minute, the API's `YYYY-MM-DDTHH:MM` (no zone: the server's). */
const MINUTE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const TW_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/

const dayParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: SERVER_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const minuteParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: SERVER_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const weekdayShort = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'short' })
const clock = new Intl.DateTimeFormat('de-DE', {
  timeZone: SERVER_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * A Taskwarrior stamp (`20261030T230000Z`) or an ISO 8601 instant as a Date.
 *
 * @param {string|null|undefined} stamp
 * @returns {Date|null} null for an empty or unreadable value
 */
export function parseStamp(stamp) {
  if (!stamp) return null
  const m = TW_RE.exec(stamp)
  const date = m
    ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
    : new Date(stamp)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * The server's calendar day of a stamp, DST-safe (the zone database does the offset).
 *
 * A bare `YYYY-MM-DD` is returned as is: that is what an optimistic patch holds after
 * a PUT sent a day (`applyPayload`), and it is the day Taskwarrior will store. A
 * server-local `YYYY-MM-DDTHH:MM` (an undo restoring a time, `minuteOf`) is that day.
 *
 * @param {string|null|undefined} stamp
 * @returns {string|null}
 */
export function dayOf(stamp) {
  if (!stamp) return null
  if (DAY_RE.test(stamp)) return stamp
  if (MINUTE_RE.test(stamp)) return stamp.slice(0, 10)
  const date = parseStamp(stamp)
  if (!date) return null
  const parts = Object.fromEntries(dayParts.formatToParts(date).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/**
 * A stamp as the server-local minute the API accepts back (`YYYY-MM-DDTHH:MM`), so an undo
 * restores the time of day and not only the day. Seconds are dropped (the API takes none).
 *
 * @param {string|null|undefined} stamp
 * @returns {string|null} null for an empty or unreadable value, a bare day, and local midnight
 *   (the bare day says exactly that)
 */
export function minuteOf(stamp) {
  if (!stamp || DAY_RE.test(stamp)) return null
  let minute = stamp
  if (!MINUTE_RE.test(stamp)) {
    const date = parseStamp(stamp)
    if (!date) return null
    const p = Object.fromEntries(minuteParts.formatToParts(date).map((x) => [x.type, x.value]))
    minute = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
  }
  return minute.endsWith('T00:00') ? null : minute
}

/** The day as a Date at noon UTC: calendar arithmetic on it never crosses a DST edge. */
const noon = (day) => new Date(`${day}T12:00:00Z`)

/**
 * @param {string} day YYYY-MM-DD
 * @param {number} n days, negative to go back
 * @returns {string}
 */
export function plusDays(day, n) {
  const d = noon(day)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * The time of day of an instant in the server's zone, as "Stand 09:41" shows it.
 *
 * @param {number|Date} instant ms since the epoch, or a Date
 * @returns {string} `HH:MM`
 */
export const timeOf = (instant) => clock.format(instant)

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (day) => noon(day).getUTCDay()

/**
 * A day as the rows show it: `Di 03.11.`
 *
 * Takes a day, not a stamp: `formatDay(dayOf(task.due))`. Formatting a stamp in the
 * browser's zone is what showed a due date one day early in the old UI (inventory 1.8).
 *
 * @param {string} day YYYY-MM-DD
 * @returns {string}
 */
export function formatDay(day) {
  const [, month, date] = day.split('-')
  const weekday = weekdayShort.format(noon(day)).replace('.', '')
  return `${weekday} ${date}.${month}.`
}

/**
 * The answers to "Wann fragst du nach?" for a todo going to Warten auf.
 *
 * Follow-ups are mostly business, so "morgen" is the next working day (Montag on a
 * Friday or a weekend: then the label says Montag), "Freitag" the next Friday (a week
 * later when it is already "morgen"), "nächste Woche" the Monday after "morgen", and
 * "ohne Datum" no follow-up at all.
 *
 * @param {string} today YYYY-MM-DD
 * @returns {Array<{answer: 'tomorrow'|'friday'|'week'|'none', day: string, label: string}>}
 *   `label` is a message key; `day` is '' for "ohne Datum".
 */
export function followUpOptions(today) {
  const tomorrow = plusDays(today, 1)
  let work = tomorrow
  while ([0, 6].includes(weekdayOf(work))) work = plusDays(work, 1)
  let friday = plusDays(today, (5 - weekdayOf(today) + 7) % 7 || 7)
  if (friday === work) friday = plusDays(friday, 7)
  let monday = plusDays(work, 1)
  while (weekdayOf(monday) !== 1) monday = plusDays(monday, 1)
  return [
    { answer: 'tomorrow', day: work, label: work === tomorrow ? 'fu.tomorrow' : 'fu.monday' },
    { answer: 'friday', day: friday, label: 'fu.friday' },
    { answer: 'week', day: monday, label: 'fu.week' },
    { answer: 'none', day: '', label: 'fu.none' },
  ]
}

/**
 * The follow-up day one answer means.
 *
 * @param {'tomorrow'|'friday'|'week'|'none'} answer
 * @param {string} today YYYY-MM-DD
 * @returns {string} YYYY-MM-DD, or '' for "ohne Datum"
 */
export function followUpDay(answer, today) {
  const option = followUpOptions(today).find((o) => o.answer === answer)
  if (!option) throw new Error(`unknown follow-up answer ${answer}`)
  return option.day
}
