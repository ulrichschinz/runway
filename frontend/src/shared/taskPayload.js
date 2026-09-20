/**
 * The request body the task form sends, on create and on edit.
 *
 * WHY THIS EXISTS. The API reads `null` (or an omitted field) as "leave it unchanged" and
 * an empty string as "clear it" (modify only). The form used to send `null` for every
 * empty field, so clearing a due date, a project or a priority in the UI returned 200 and
 * changed nothing. The rule is pure, so it lives here and is tested; the component only
 * calls it.
 *
 * - Create (`original` is null): an empty field is `null`, i.e. not given.
 * - Edit: a field that had a value and is now empty is `''` (clears it); a field whose
 *   value did not change is omitted, so an untouched date is never rewritten.
 * - `tags` and `depends` are always the complete arrays: the API treats both as the full
 *   desired set.
 */

/** The scalar fields that can be cleared, in the order the API documents them. */
export const CLEARABLE_FIELDS = ['project', 'priority', 'due', 'scheduled', 'wait', 'until', 'recur']

/** A form value as the API sees it: trimmed text, `''` for empty or null. */
function normalize(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/**
 * @param {object} form      the current form state
 * @param {object|null} original  the form state when the task was opened; null on create
 * @returns {object} the body for POST /tasks or PUT /tasks/{uuid}
 */
export function buildTaskPayload(form, original) {
  const payload = {
    description: normalize(form.description),
    tags: [...(form.tags || [])],
    depends: [...(form.depends || [])],
  }
  for (const field of CLEARABLE_FIELDS) {
    const value = normalize(form[field])
    if (!original) {
      payload[field] = value || null
    } else if (value !== normalize(original[field])) {
      payload[field] = value
    }
  }
  return payload
}
