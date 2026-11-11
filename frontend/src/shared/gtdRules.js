/**
 * The GTD lists and the moves between them: which list a todo is in, and the exact
 * `PUT /tasks/{uuid}` body (and its inverse, for Rückgängig) that moves it.
 *
 * Ported from the approved prototype (`06-kombination/rules.js`) with the plan's
 * corrections (brief 0048):
 *   F2  a legacy comma tag (`"next,@home"`, one element) can be removed but never added
 *       (the API refuses commas): a move adds back its other parts, and an inverse
 *       restores parts, never the comma tag;
 *   F3  an optimistic patch holds the day the PUT sent, never an invented timestamp;
 *   F4  `/gtd/next` is `+next` alone, but a todo that also carries `waiting` or `someday`
 *       belongs to that list here (and on Android, through the shared vectors).
 *
 * Lists, as the server defines them (`task_service._VIEW_FILTERS`):
 *   Inbox      no tags at all and no project
 *   Nächste    +next, and not also +waiting or +someday (F4)
 *   Warten auf +waiting        Irgendwann +someday
 *   anything else is "ohne Liste" (`none`): a project or a context without a status tag.
 *
 * Every tag test splits comma-joined tags (`contextTags.js`). Pure: no Vue, no store.
 */

import { allTagParts, contextTagsOf, splitTagParts } from './contextTags.js'
import { dayOf, minuteOf, plusDays } from './dates.js'

// The other rule modules read tags through this one, so the comma rule has one entry
// point for the new UI (and `contextTags.js` keeps its fan-in).
export { allTagParts, contextTagsOf }

export const STATUS_TAGS = ['next', 'waiting', 'someday']

/** Whether any tag part of the task equals `tag`. */
export const hasTag = (t, tag) => allTagParts(t).includes(tag)
export const isWaiting = (t) => hasTag(t, 'waiting')
export const isSomeday = (t) => hasTag(t, 'someday')
export const isNext = (t) => hasTag(t, 'next') && !isWaiting(t) && !isSomeday(t)
export const isInbox = (t) => !t.project && allTagParts(t).length === 0

/**
 * @returns {'inbox'|'waiting'|'someday'|'next'|'none'}
 */
export function listOf(t) {
  if (isInbox(t)) return 'inbox'
  if (isWaiting(t)) return 'waiting'
  if (isSomeday(t)) return 'someday'
  if (isNext(t)) return 'next'
  return 'none'
}

/**
 * Raised when a move would have to guess metadata or could not be sent. The UI asks the
 * missing question or explains instead; nothing has been sent. `what` is `'context'`
 * (Nächste needs one) or `'legacyTag'` (a legacy comma tag holds a part the API would
 * refuse to add back, see `isAddableTag`).
 */
export class NeedsAnswer extends Error {
  constructor(what) {
    super(`needs ${what}`)
    this.name = 'NeedsAnswer'
    this.what = what
  }
}

/**
 * Whether the API accepts `tag` in `tags_add`: a mirror of `TAG_RE` in
 * `backend/app/services/task_service.py`. A legacy tag may hold parts that only the looser
 * `EXISTING_TAG_RE` let in (`a/b`); such a part can be removed but never added back. The
 * mirror is never stricter than the server (Python's `\w` is `\p{L}\p{N}_` here).
 */
const TAG_RE = /^(?:@|[\p{L}\p{Nl}\p{No}_])[\p{L}\p{N}_@.-]*$/u
export const isAddableTag = (tag) => TAG_RE.test(tag)

/** F2 repair parts the API would refuse: the move cannot be sent as one PUT. */
function refuseUnaddable(parts) {
  if (parts.some((part) => !isAddableTag(part))) throw new NeedsAnswer('legacyTag')
}

/** The raw tags (as stored) that contain `part` among their comma-separated parts. */
const rawTagsWith = (t, part) => (t.tags || []).filter((tag) => splitTagParts(tag).includes(part))

/** Append to `list` each of `items` it does not hold yet. */
const addAll = (list, items) => {
  for (const item of items) if (item && !list.includes(item)) list.push(item)
  return list
}

/**
 * Clarify an Inbox item.
 *
 * @param {string} to `'next:@ctx'` | `'waiting'` | `'someday'` | `'project:Name'`
 * @param {{ctx?: string, followUp?: string}} [opts] `ctx`: the first action's context
 *   for a project; `followUp`: the follow-up day (YYYY-MM-DD, '' for none) for Warten auf
 * @returns {object} the PUT body
 * @throws {NeedsAnswer} Nächste or a project without a context
 */
export function clarifyPayload(to, opts = {}) {
  const [kind, arg] = String(to).split(/:(.*)/s)
  if (kind === 'next') {
    if (!arg) throw new NeedsAnswer('context')
    return { tags_add: ['next', arg] }
  }
  if (kind === 'waiting') {
    return opts.followUp ? { tags_add: ['waiting'], scheduled: opts.followUp } : { tags_add: ['waiting'] }
  }
  if (kind === 'someday') return { tags_add: ['someday'] }
  if (kind === 'project' && arg) {
    if (!opts.ctx) throw new NeedsAnswer('context')
    return { project: arg, tags_add: ['next', opts.ctx] }
  }
  throw new Error(`unknown clarify target ${to}`)
}

/**
 * Move between Nächste, Warten auf and Irgendwann: add the one status tag, remove the
 * other two, keep every context.
 *
 * F2: a raw comma tag holding a status tag that goes is removed whole, and its other
 * parts (contexts, other tags) are added back singly, so `"next,@home"` → Warten auf
 * keeps `@home`.
 *
 * A part the API would refuse to add (`"next,a/b"`) cannot be repaired that way: the
 * move is refused before anything is sent (`NeedsAnswer('legacyTag')`).
 *
 * Leaving Warten auf clears `scheduled`: there it was the follow-up day, not a plan, and
 * kept it would count as "für heute". The inverse restores it.
 *
 * `ctx`, the answer to Nächste's question for a todo without a context, goes into the same
 * PUT, so one inverse takes back both (brief 0054).
 *
 * @param {object} t the task
 * @param {'next'|'waiting'|'someday'} list
 * @param {string} [ctx] the context chosen for Nächste
 * @returns {object} the PUT body
 * @throws {NeedsAnswer} Nächste for a todo without a context and no `ctx`
 */
export function listPayload(t, list, ctx = '') {
  if (!STATUS_TAGS.includes(list)) throw new Error(`not a list move: ${list}`)
  const missing = list === 'next' && contextTagsOf(t).length === 0
  if (missing && !ctx) throw new NeedsAnswer('context')
  const leaving = STATUS_TAGS.filter((s) => s !== list)
  const tagsRemove = addAll([], leaving.flatMap((s) => rawTagsWith(t, s)))
  const remaining = (t.tags || []).filter((tag) => !tagsRemove.includes(tag))
  const keptParts = tagsRemove
    .flatMap(splitTagParts)
    .filter((part) => part && !leaving.includes(part) && !remaining.includes(part))
  refuseUnaddable(keptParts)
  const body = { tags_add: addAll([list], [...keptParts, ...(missing ? [ctx] : [])]) }
  if (tagsRemove.length) body.tags_remove = tagsRemove
  if (isWaiting(t) && list !== 'waiting' && t.scheduled) body.scheduled = ''
  return body
}

/**
 * Toggle one tag (a context, or any other tag the detail edits): add it when no tag part
 * of the todo is `tag`, else remove it. Never touches next, waiting or someday unless asked.
 *
 * Removing a tag that sits in a legacy comma tag removes the raw tag and adds back its
 * other parts, which repairs the tag (F2). Refused like `listPayload` when such a part
 * cannot be added back.
 *
 * @returns {object} the PUT body
 * @throws {NeedsAnswer} `'legacyTag'`
 */
export function tagPayload(t, tag) {
  if (!hasTag(t, tag)) return { tags_add: [tag] }
  const raws = rawTagsWith(t, tag)
  if (raws.every((raw) => raw === tag)) return { tags_remove: raws }
  const remaining = (t.tags || []).filter((raw) => !raws.includes(raw))
  const keep = raws
    .flatMap(splitTagParts)
    .filter((part) => part && part !== tag && !remaining.includes(part))
  refuseUnaddable(keep)
  const body = { tags_remove: raws }
  if (keep.length) body.tags_add = addAll([], keep)
  return body
}

/**
 * Toggle one context: `tagPayload` for an `@` tag (a context part is a tag part).
 *
 * @returns {object} the PUT body
 * @throws {NeedsAnswer} `'legacyTag'`
 */
export function contextPayload(t, ctx) {
  return tagPayload(t, ctx)
}

/**
 * What an inverse needs to know about a task before a move. `scheduledAt` is the server-local
 * minute of `scheduled` (null for a bare day), so Rückgängig gives back the time too (brief
 * 0054); `scheduledDay` alone is what the shared vectors describe.
 *
 * @returns {{tags: string[], project: string|null, scheduledDay: string|null, scheduledAt: string|null}}
 */
export function beforeOf(t) {
  return {
    tags: [...(t.tags || [])], project: t.project || null, scheduledDay: dayOf(t.scheduled), scheduledAt: minuteOf(t.scheduled),
  }
}

/**
 * The exact inverse of a clarify, list, context or plan move, for Rückgängig.
 *
 * Works on tag **parts** (F2): it removes what the move added (unless it was a part
 * before) and adds back, singly, every part the task had before and no longer has. A
 * comma tag the move removed is therefore restored as its parts — the API would refuse
 * the comma tag itself. Restores `project` and `scheduled` when the move changed them;
 * `scheduled` to its minute when `before.scheduledAt` has one, else to its day.
 *
 * @param {{tags: string[], project: string|null, scheduledDay: string|null, scheduledAt?: string|null}} before `beforeOf(task)`
 * @param {object} body the PUT body that was sent
 * @returns {object} the PUT body that undoes it
 */
export function inversePayload(before, body) {
  const beforeParts = allTagParts(before)
  const after = applyTags(before.tags, body)
  const tagsRemove = after.filter((tag) => !before.tags.includes(tag) && !beforeParts.includes(tag))
  const left = allTagParts({ tags: after.filter((tag) => !tagsRemove.includes(tag)) })
  const tagsAdd = addAll([], beforeParts.filter((part) => !left.includes(part)))
  const out = {}
  if (tagsRemove.length) out.tags_remove = tagsRemove
  if (tagsAdd.length) out.tags_add = tagsAdd
  if ('project' in body && (body.project || null) !== (before.project || null)) {
    out.project = before.project || ''
  }
  if ('scheduled' in body && (body.scheduled || null) !== (before.scheduledDay || null)) {
    out.scheduled = before.scheduledAt || before.scheduledDay || ''
  }
  return out
}

/** The raw tag list after a body's deltas, as the server applies them. */
function applyTags(tags, body) {
  const removed = new Set(body.tags_remove || [])
  return addAll(
    (tags || []).filter((tag) => !removed.has(tag)),
    body.tags_add || [],
  )
}

/**
 * A PUT body applied to a copy of the task the way the server applies it — for the
 * optimistic row until the server's task replaces it.
 *
 * `scheduled` becomes the bare day the body sent (or null when cleared), never a
 * timestamp: Taskwarrior decides the stamp, and every rule compares days (F3).
 *
 * @returns {object} a new task; the argument is not changed
 */
export function applyPayload(t, body) {
  const next = { ...t, tags: applyTags(t.tags, body) }
  if ('project' in body) next.project = body.project || null
  if ('scheduled' in body) next.scheduled = body.scheduled || null
  return next
}

/**
 * `t`: plan a todo for today, or take it off today's plan (it is planned when its
 * `scheduled` day is today or earlier).
 *
 * Refused (null) for Inbox, Warten auf and Irgendwann: the day progress never counts
 * those as planned, and in Warten auf `scheduled` is the follow-up day.
 *
 * @param {object} t
 * @param {string} today YYYY-MM-DD, the server's (`/gtd/summary`)
 * @returns {{scheduled: string}|null}
 */
export function planPayload(t, today) {
  if (['inbox', 'waiting', 'someday'].includes(listOf(t))) return null
  const day = dayOf(t.scheduled)
  return { scheduled: day && day <= today ? '' : today }
}

/** C0 control characters and DEL, which `PROJECT_RE` refuses. */
const isControl = (ch) => ch.codePointAt(0) < 0x20 || ch.codePointAt(0) === 0x7f

// Python's `\s` (str.isspace) exactly, which `PROJECT_RE` uses: JS `\s` differs (it holds
// U+FEFF and lacks U+001C–U+001F and U+0085).
const PY_SPACE = '\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const ALL_SPACE = new RegExp(`^[${PY_SPACE}]*$`)
const BAD_START = new RegExp(`^[+\\-${PY_SPACE}]`)
const BAD_END = new RegExp(`[${PY_SPACE}]$`)

/**
 * Project names as the API accepts them (`backend/app/models.py`: `PROJECT_RE`,
 * `RESERVED_PROJECT_NAMES`), plus a duplicate check.
 *
 * @param {string} name
 * @param {string[]} [existing] the names already taken (compared case-insensitively)
 * @returns {string} a message key, or '' when the name is fine
 */
export function projectNameError(name, existing = []) {
  const n = String(name)
  if (ALL_SPACE.test(n)) return 'proj.err.empty'
  if ([...n].length > 100) return 'proj.err.long'
  if ([...n].some(isControl) || /[()"'\\:/?#%]/.test(n)) return 'proj.err.chars'
  if (BAD_START.test(n) || BAD_END.test(n)) return 'proj.err.edge'
  if (['overview', 'plans'].includes(n)) return 'proj.err.reserved'
  if (existing.some((p) => p.toLowerCase() === n.toLowerCase())) return 'proj.err.exists'
  return ''
}

/**
 * The weekly review is due (06 web.js: the rail's yellow ring and `fällig`): never recorded, or
 * the last one was seven or more calendar days before `today`. Days are compared in server time
 * (`dayOf`), so a timestamp just before or after a DST night counts for its own day.
 *
 * @param {string|null|undefined} lastWeekly  the last weekly review stamp (`/gtd/summary`)
 * @param {string|null} today  `YYYY-MM-DD`, or null before the first load (then never due)
 * @returns {boolean}
 */
export function reviewDue(lastWeekly, today) {
  if (!today) return false
  const last = lastWeekly ? dayOf(lastWeekly) : null
  return !last || last <= plusDays(today, -7)
}

/**
 * The margin's "Rückblick" (06 `todayPanel`): the server's day of the last weekly review and
 * the calendar days since, with `due` as `reviewDue` decides it.
 *
 * @param {string|null|undefined} lastWeekly  the last weekly review stamp (`/gtd/summary`)
 * @param {string} today  `YYYY-MM-DD`
 * @returns {{day: string|null, days: number|null, due: boolean}} `day` and `days` are null when
 *   no weekly review was ever recorded
 */
export function reviewAge(lastWeekly, today) {
  const day = lastWeekly ? dayOf(lastWeekly) : null
  const days = day ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86400000) : null
  return { day, days, due: reviewDue(lastWeekly, today) }
}

/**
 * How the margin's "Rückblick" says how long ago the last weekly review was: ", heute." (0 days),
 * ", gestern." (1), ", vor {n} Tagen." (more). German has no "vor 1 Tagen".
 *
 * @param {number} days  `reviewAge(…).days`
 * @returns {'m.reviewToday'|'m.reviewAgo1'|'m.reviewAgo'} the message key (`{n}` is the days)
 */
export function reviewAgoKey(days) {
  if (!days) return 'm.reviewToday'
  return days === 1 ? 'm.reviewAgo1' : 'm.reviewAgo'
}
