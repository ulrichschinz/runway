import { computed, reactive, ref, watch } from 'vue'
import client from '../api/client.js'
import { planBody, planDirty, planEmpty, planFrom } from '../shared/projectPlan.js'

/** An id for a new idea or step, unique within its list (the API takes any string). */
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

const copy = (plan) => planFrom(planBody(plan), newId)

/**
 * A project's plan as its page holds it (plan M13, brief 0060): the plan as saved and the draft
 * the document edits. The page holds it, not the document, so the draft outlives the document —
 * a todo's detail takes the margin column's place, and the plan comes back as it was.
 *
 * Reads `GET /projects/plans/{name}` whenever the name changes; "Speichern" sends the whole draft
 * (`PUT /projects/plans/{name}`, `planBody`). Plan writes are not in the outbox (plan §6.4): a
 * failed save keeps the draft and says why. A plan that could not be read is never saved over.
 *
 * @param {() => string} nameOf the project's name (the route's)
 * @param {{onSaved?: () => void}} [options] after a save (the store's overview reads `has_plan`)
 * @returns a reactive object: `draft`, `saved`, `state` (`loading` | `ready` | `failed`),
 *   `saving`, `error` (`{key, m}` or null), `dirty`, `empty`, and `load`, `save`, `discard`, `set`
 */
export function usePlan(nameOf, { onSaved = () => {} } = {}) {
  const saved = ref(planFrom(null, newId))
  const draft = ref(planFrom(null, newId))
  const state = ref('loading')
  const saving = ref(false)
  const error = ref(null)
  /** When the last save came back, so the document can say "Gespeichert" for a moment. */
  const savedAt = ref(0)
  let asked = null

  async function load(name = nameOf()) {
    asked = name
    state.value = 'loading'
    error.value = null
    // "Gespeichert" is about the plan saved here: another project's plan was not.
    savedAt.value = 0
    try {
      const { data } = await client.get(`/projects/plans/${encodeURIComponent(name)}`)
      if (asked !== name) return
      saved.value = planFrom(data, newId)
      draft.value = copy(saved.value)
      state.value = 'ready'
    } catch {
      if (asked === name) state.value = 'failed'
    }
  }

  watch(nameOf, (name) => {
    if (name) load(name)
  }, { immediate: true })

  const dirty = computed(() => state.value === 'ready' && planDirty(draft.value, saved.value))

  async function save() {
    if (state.value !== 'ready' || saving.value || !dirty.value) return false
    const name = nameOf()
    const sent = copy(draft.value)
    saving.value = true
    error.value = null
    try {
      const { data } = await client.put(`/projects/plans/${encodeURIComponent(name)}`, planBody(sent))
      // Saved, even when the page has moved on to another project: the overview's `has_plan` is read again.
      onSaved()
      if (asked !== name) return false
      // What the server stored; a draft typed on while the save was under way stays a draft.
      saved.value = planFrom(data, newId)
      if (!planDirty(draft.value, sent)) draft.value = copy(saved.value)
      savedAt.value = Date.now()
      return true
    } catch (e) {
      // A failed save of the project the page has left is not this plan's error (its draft is gone anyway).
      if (asked !== name) return false
      const detail = e.response?.data?.detail
      error.value = e.response ? { key: 'plan.saveFailed', m: typeof detail === 'string' ? detail : String(e.response.status) } : { key: 'plan.saveFailedNet' }
      return false
    } finally {
      saving.value = false
    }
  }

  function discard() {
    draft.value = copy(saved.value)
    error.value = null
  }

  /** One field of the draft: a text, or a list of `{id, text}`. */
  function set(field, value) {
    draft.value = { ...draft.value, [field]: value }
  }

  return reactive({
    draft, saved, state, saving, error, savedAt, dirty,
    empty: computed(() => planEmpty(saved.value)),
    load: () => load(), save, discard, set, newId,
  })
}
