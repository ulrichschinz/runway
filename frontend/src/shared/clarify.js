/**
 * Clarifying an Inbox item with two keys (06 `clarifyPanel`, `clarifyKey`, the Inbox branch of
 * its keydown handler, `labelFor`; plan M8, brief 0054): which question is open, what a key
 * answers, and what the notice says once the item is filed. Never guess: a target that needs an
 * answer (Nächste a context, Warten auf a follow-up day, a project its first action's context) is
 * filed only with that answer.
 *
 * A step is `{step, project}`:
 *   null          the first question, "Was ist es?"
 *   'ctx'         Nächste · which context (1–5)
 *   'follow'      Warten auf · when to follow up (1–4)
 *   'project'     which project (1–9), or `n` for a new one
 *   'newproject'  the new project's name (typed)
 *   'projctx'     the first action's context for `project` (1–5)
 *
 * Pure: no Vue, no store. Texts come through `t()`.
 */

import { followUpOptions, formatDay } from './dates.js'
import { contextTagsOf } from './gtdRules.js'
import { t } from './i18n.js'

export const NO_STEP = Object.freeze({ step: null, project: null })

/** How many choices of a step get a digit key. */
const KEYED = { ctx: 5, projctx: 5, follow: 4, project: 9 }

/**
 * `a` (`'ctx'`), `w` (`'follow'`) or `p` (`'project'`) opens its question; the same key again
 * closes it — for `p` also while its later steps are open.
 *
 * @param {{step: string|null, project: string|null}} state
 * @param {'ctx'|'follow'|'project'} kind
 */
export function startStep(state, kind) {
  const open = state.step === kind || (kind === 'project' && ['projctx', 'newproject'].includes(state.step))
  return open ? NO_STEP : { step: kind, project: null }
}

/** `Esc`: from a project's context or a new name back to the projects, else to the first question. */
export function stepBack(state) {
  return ['projctx', 'newproject'].includes(state.step) ? { step: 'project', project: null } : NO_STEP
}

/**
 * The answers the open step offers, in order: the first ones carry a digit key.
 *
 * @param {{step: string|null}} state
 * @param {{contexts: string[], projects: string[], today: string}} sources the contexts to offer
 *   (`clarifyContexts`), the active projects' names, the server's today
 * @returns {Array<{key: string|null, value: string, label: string, hint?: string}>}
 */
export function stepChoices(state, { contexts, projects, today }) {
  const keyed = (values, step) =>
    values.map((value, i) => ({ key: i < KEYED[step] ? String(i + 1) : null, value, label: value }))
  switch (state.step) {
    case 'ctx':
    case 'projctx':
      return keyed(contexts, state.step)
    case 'project':
      return keyed(projects, 'project')
    case 'follow':
      return followUpOptions(today).map((o, i) => ({
        key: String(i + 1), value: o.day, label: t(o.label), hint: o.day ? formatDay(o.day) : t('fu.noneHint'),
      }))
    default:
      return []
  }
}

/**
 * One choice of the open step taken (a click, or its digit).
 *
 * @returns {null | {state: object} | {file: {to: string, opts: object}}} the next step, or what
 *   to file (`gtd.clarify(uuid, to, opts)`); null when there is no such choice
 */
export function pickChoice(state, choice) {
  if (!choice) return null
  switch (state.step) {
    case 'ctx':
      return { file: { to: `next:${choice.value}`, opts: {} } }
    case 'follow':
      return { file: { to: 'waiting', opts: { followUp: choice.value } } }
    case 'project':
      return { state: { step: 'projctx', project: choice.value } }
    case 'projctx':
      return { file: { to: `project:${state.project}`, opts: { ctx: choice.value } } }
    default:
      return null
  }
}

/**
 * A key while a step is open: a digit picks that choice, `n` in the project step asks for a new
 * project's name.
 *
 * @returns {null | {state: object} | {file: {to: string, opts: object}}} as `pickChoice`
 */
export function answerStep(state, key, sources) {
  if (state.step === 'project' && key === 'n') return { state: { step: 'newproject', project: null } }
  return pickChoice(state, stepChoices(state, sources).find((c) => c.key === key))
}

/**
 * Where a filed item went, for the notice (`→ …`): 'Nächste · @computer',
 * 'Warten auf · nachhaken Fr 06.11.', 'Projekt · Garten · @zuhause', 'Irgendwann', 'erledigt'.
 *
 * @param {string} to a clarify target (`gtd.clarify`)
 * @param {{followUp?: string, ctx?: string}} [opts]
 */
export function filedLabel(to, opts = {}) {
  const [kind, arg] = String(to).split(/:(.*)/s)
  if (kind === 'next') return t('filed.next', { ctx: arg })
  if (kind === 'waiting') return opts.followUp ? t('filed.waitingOn', { day: formatDay(opts.followUp) }) : t('filed.waiting')
  if (kind === 'project') return t('filed.project', { p: arg, ctx: opts.ctx })
  if (kind === 'someday') return t('filed.someday')
  if (kind === 'done') return t('filed.done')
  if (kind === 'delete') return t('filed.deleted')
  throw new Error(`unknown clarify target ${to}`)
}

/**
 * Where a list move took a todo: Nächste with its contexts ('Nächste · @anrufe @computer'),
 * else the list's name.
 *
 * @param {object} task the todo before the move
 * @param {'next'|'waiting'|'someday'} list
 * @param {string} [ctx] the context the move adds to a todo without one
 */
export function moveLabel(task, list, ctx = '') {
  if (list === 'next') return t('filed.next', { ctx: contextTagsOf(task).join(' ') || ctx })
  return t(`filed.${list}`)
}
