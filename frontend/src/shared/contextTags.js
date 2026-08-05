/**
 * GTD context tags (`@home`, `@work`, ...) and the comma-splitting they require.
 *
 * WHY THIS EXISTS. Taskwarrior returns a task's tags as an array, but a tag that was
 * entered as a comma-separated list arrives as a SINGLE element — `"@home,@errands"`
 * rather than `["@home", "@errands"]`. Every place that reads context tags therefore has
 * to split on commas and trim.
 *
 * That splitting expression previously existed in three copies (`stores/tasks.js` twice,
 * `views/_useTaskView.js` once) and has already produced two bugs: commit c6ce0f2 fixed
 * comma-joined contexts being treated as one context, and 472b673 fixed the sidebar not
 * updating. Three copies of a rule is three chances to fix it in two places.
 *
 * These functions are pure — no Vue, no store, no network — which is what makes them
 * directly testable.
 */

/** The context prefix. A tag part is a GTD context iff it starts with this. */
const CONTEXT_PREFIX = '@'

/**
 * Split one raw tag into its comma-separated parts, trimmed.
 *
 * Empty parts are preserved rather than dropped, so this stays a faithful `split`; the
 * callers below filter them out via the `@` test.
 *
 * @param {string} tag
 * @returns {string[]}
 */
export function splitTagParts(tag) {
  return String(tag).split(',').map((part) => part.trim())
}

/**
 * Every context tag carried by a task, in the order encountered.
 *
 * @param {{tags?: string[]}} task
 * @returns {string[]}
 */
export function contextTagsOf(task) {
  return (task.tags || []).flatMap((tag) =>
    splitTagParts(tag).filter((part) => part.startsWith(CONTEXT_PREFIX)),
  )
}

/**
 * Whether a task carries a given context.
 *
 * Compares against ALL parts rather than only the `@`-prefixed ones, preserving the
 * behaviour of the call site this replaced. In practice a context always starts with
 * `@`, so the distinction is invisible — but narrowing it here would be a silent
 * behaviour change rather than a move.
 *
 * @param {{tags?: string[]}} task
 * @param {string} context
 * @returns {boolean}
 */
export function taskHasContext(task, context) {
  return (task.tags || []).some((tag) => splitTagParts(tag).includes(context))
}

/**
 * Every distinct context tag across a set of tasks, sorted.
 *
 * @param {Array<{tags?: string[]}>} tasks
 * @returns {string[]}
 */
export function collectContextTags(tasks) {
  const seen = new Set()
  tasks.forEach((task) => contextTagsOf(task).forEach((context) => seen.add(context)))
  return [...seen].sort()
}

/**
 * Every tag part a task carries — contexts and ordinary tags alike — with empties dropped.
 *
 * Used when editing a task, where a comma-joined tag must appear as separate, individually
 * removable chips rather than as one unsplittable blob.
 *
 * @param {{tags?: string[]}} task
 * @returns {string[]}
 */
export function allTagParts(task) {
  return (task.tags || []).flatMap(splitTagParts).filter(Boolean)
}

/**
 * Parse tag text typed by a user into individual tags.
 *
 * Accepts a comma-separated list, tolerates a leading `+` (Taskwarrior's own add syntax,
 * which users type out of habit), and drops both empty entries and a bare `@` — which is
 * what remains when someone types the context prefix and then hesitates.
 *
 * @param {string} raw
 * @returns {string[]}
 */
export function parseTagInput(raw) {
  return splitTagParts(raw)
    .map((part) => part.replace(/^\+/, ''))
    .filter((part) => part && part !== CONTEXT_PREFIX)
}
