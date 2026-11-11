/**
 * A project's plan as the plan document edits it (plan M13, brief 0060): GTD's Natural Planning
 * Model in the five steps of the old modal — Warum (purpose, principles), Vision, Ideen
 * (brainstorm), Ordnen (organized), Aktionen (a step becomes a next action). Pure: the draft is
 * a plain object, every edit returns a new one, and nothing here talks to the API
 * (`GET`/`PUT /projects/plans/{name}`, `projects/usePlan.js`).
 */

/** The text fields, in the document's order. */
export const PLAN_TEXTS = ['purpose', 'principles', 'vision']

/** The list fields: items `{id, text}`, ids unique within the list (the API's `BrainstormItem`). */
export const PLAN_LISTS = ['brainstorm', 'organized']

const items = (list, newId) =>
  (Array.isArray(list) ? list : [])
    .filter((item) => item && typeof item.text === 'string')
    .map((item) => ({ id: typeof item.id === 'string' && item.id ? item.id : newId(), text: item.text }))

/**
 * The draft of what the API answered: every field there, an item without an id given one.
 *
 * @param {object|null} data `GET /projects/plans/{name}`'s body, or nothing (no plan yet)
 * @param {() => string} newId
 */
export function planFrom(data, newId) {
  const d = data || {}
  return {
    purpose: typeof d.purpose === 'string' ? d.purpose : '',
    principles: typeof d.principles === 'string' ? d.principles : '',
    vision: typeof d.vision === 'string' ? d.vision : '',
    brainstorm: items(d.brainstorm, newId),
    organized: items(d.organized, newId),
  }
}

/** The body of `PUT /projects/plans/{name}`: all five fields, so the stored plan is exactly the draft. */
export function planBody(plan) {
  return {
    purpose: plan.purpose,
    principles: plan.principles,
    vision: plan.vision,
    brainstorm: plan.brainstorm.map(({ id, text }) => ({ id, text })),
    organized: plan.organized.map(({ id, text }) => ({ id, text })),
  }
}

/** Whether the draft says anything other than what was saved. */
export const planDirty = (draft, saved) => JSON.stringify(planBody(draft)) !== JSON.stringify(planBody(saved))

/** Whether the plan says anything at all (the server's `has_plan`). */
export const planEmpty = (plan) =>
  PLAN_TEXTS.every((f) => !plan[f].trim()) && PLAN_LISTS.every((f) => plan[f].length === 0)

/** One more item at the end; a blank text adds nothing (the same list comes back). */
export function withItem(list, text, id) {
  const v = String(text).trim()
  return v ? [...list, { id, text: v }] : list
}

export const withoutItem = (list, id) => list.filter((item) => item.id !== id)

/** The item at `i` one place up (`step` -1) or down (+1); at an end, the same list comes back. */
export function moveItem(list, i, step) {
  const j = i + step
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/**
 * "Aus Ideen übernehmen" (the old modal's step 4): every idea not yet among the ordered steps
 * (by its text) is added at the end, under a new id.
 */
export function ideasToOrganized(brainstorm, organized, newId) {
  const have = new Set(organized.map((item) => item.text.trim()))
  const fresh = brainstorm.filter((item) => !have.has(item.text.trim()))
  return fresh.length ? [...organized, ...fresh.map((item) => ({ id: newId(), text: item.text }))] : organized
}

/** The outcome a project's page shows under its name: the vision's first non-empty line. */
export function outcomeOf(plan) {
  return (plan?.vision || '').split('\n').map((line) => line.trim()).find(Boolean) || ''
}
