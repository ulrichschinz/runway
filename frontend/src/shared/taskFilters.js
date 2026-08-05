/**
 * Pure task list filtering, extracted from `views/_useTaskView.js`.
 *
 * The composable it came from is entangled with Vue lifecycle hooks, keyboard listeners
 * and the store, none of which the filtering rules need. Separating them makes the rules
 * testable without mounting anything.
 *
 * Moved verbatim: the search is still case-insensitive across description, project and
 * raw tag strings, and the context filter still runs before the search.
 */

import { taskHasContext } from './contextTags.js'

/**
 * Apply the active context filter, then the search query.
 *
 * @param {Array<object>} tasks
 * @param {{context?: string|null, query?: string}} options
 * @returns {Array<object>}
 */
export function filterTasks(tasks, { context = null, query = '' } = {}) {
  let result = tasks

  if (context) {
    result = result.filter((task) => taskHasContext(task, context))
  }

  const needle = query.trim().toLowerCase()
  if (!needle) return result

  return result.filter((task) => matchesSearch(task, needle))
}

/**
 * Whether a task matches an already-normalised (trimmed, lower-cased) search needle.
 *
 * Note this searches the RAW tag strings, so a comma-joined tag is matched as one string.
 * That is the existing behaviour and is preserved deliberately — searching "home,work"
 * finds a task tagged `"@home,@work"`.
 *
 * @param {object} task
 * @param {string} needle
 * @returns {boolean}
 */
export function matchesSearch(task, needle) {
  return (
    task.description.toLowerCase().includes(needle) ||
    Boolean(task.project && task.project.toLowerCase().includes(needle)) ||
    task.tags.some((tag) => tag.toLowerCase().includes(needle))
  )
}

/**
 * Sort a copy of the list by urgency, most urgent first.
 *
 * The backend already returns tasks in this order; the frontend re-sorts after a local
 * insert so an optimistic update lands in the right place.
 *
 * @param {Array<{urgency: number}>} tasks
 * @returns {Array<object>}
 */
export function byUrgencyDescending(tasks) {
  return [...tasks].sort((a, b) => b.urgency - a.urgency)
}
