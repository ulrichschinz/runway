import { computed, ref, watch } from 'vue'
import { NO_STEP, answerStep, filedLabel, pickChoice, startStep, stepBack, stepChoices } from '../shared/clarify.js'
import { projectNameError } from '../shared/gtdRules.js'
import { t } from '../shared/i18n.js'
import { useGtdStore } from './stores/gtd.js'

/**
 * The clarify panel's state and actions (06 `clarify`, `clarifyKey`, `newProjectStep`,
 * `submitProjectName`; plan M8): the open question for the Inbox item `target`, answered by a
 * click or a key, and the filing itself, which leaves the list through `leave` (the list page's
 * one path for a row that goes, with the notice and Rückgängig). The rules are pure, in
 * `shared/clarify.js`; this only holds the step and writes.
 *
 * @param {object} options
 * @param {{value: object|null}} options.target (a computed) the item being clarified
 * @param {(uuid: string, how: string, write: () => object|null, text: string) => object|null} options.leave
 */
export function useClarify({ target, leave }) {
  const gtd = useGtdStore()
  const state = ref(NO_STEP)
  /** A message key: why the typed project name cannot be taken. */
  const nameError = ref('')

  const projects = computed(() => gtd.projects.filter((p) => p.status === 'active').map((p) => p.name))
  /** Every name a new project must not repeat: the overview's and those only todos carry yet. */
  const knownProjects = computed(() => [
    ...new Set([...gtd.projects.map((p) => p.name), ...gtd.open.map((x) => x.project).filter(Boolean)]),
  ])
  const sources = computed(() => ({ contexts: gtd.contextChoices, projects: projects.value, today: gtd.today }))
  const choices = computed(() => (gtd.today ? stepChoices(state.value, sources.value) : []))

  function reset() {
    state.value = NO_STEP
    nameError.value = ''
  }
  // Another item under the cursor: its own first question. A capture the server has just named is
  // the same item under its new uuid, and keeps its open question.
  watch(() => target.value?.uuid, (now, before) => {
    if (now && before && gtd.uuidNow(before) === now) return
    reset()
  })

  /** `'next'` (a), `'waiting'` (w), `'project'` (p) open their question; `'someday'` files at once. */
  function ask(kind) {
    if (kind === 'someday') return file('someday')
    nameError.value = ''
    state.value = startStep(state.value, { next: 'ctx', waiting: 'follow', project: 'project' }[kind])
  }

  function follow(result) {
    if (!result) return false
    if (result.state) {
      state.value = result.state
      nameError.value = ''
    } else file(result.file.to, result.file.opts)
    return true
  }

  /**
   * File the item: `'someday'`, `'done'`, `'delete'`, or a target with its answer.
   * @returns {object|null} the op
   */
  function file(to, opts = {}) {
    const item = target.value
    if (!item) return null
    const how = to === 'done' || to === 'delete' ? to : 'filed'
    const text = how === 'done' ? t('notice.done') : how === 'delete' ? t('notice.deleted') : t('notice.moved', { list: filedLabel(to, opts) })
    const op = leave(item.uuid, how, () => gtd.clarify(item.uuid, to, opts), text)
    if (op) reset()
    return op
  }

  /** The typed name of a new project: checked as the API checks it, then its first action's context. */
  function nameProject(name) {
    const n = String(name).trim()
    nameError.value = projectNameError(n, knownProjects.value)
    if (!nameError.value) state.value = { step: 'projctx', project: n }
  }

  return {
    state,
    step: computed(() => state.value.step),
    /** what the steps offer: the contexts, the active projects, the server's today (`stepChoices`) */
    sources,
    choices,
    nameError,
    ask,
    /** A key while a question is open (`1`–`9`, `n`). @returns {boolean} whether it answered */
    answer: (key) => follow(answerStep(state.value, key, sources.value)),
    /** A click on one of `choices`. */
    pick: (choice) => follow(pickChoice(state.value, choice)),
    back: () => {
      nameError.value = ''
      state.value = stepBack(state.value)
    },
    file,
    nameProject,
    /** Close the open question (the panel was hidden). */
    reset,
  }
}
