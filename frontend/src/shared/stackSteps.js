/**
 * The card stack's steps (06 `stack.js` `TRAYS`, `stepOptions`, `act`, `answer`, `cancel`, `key`,
 * `order`; plan M10, brief 0057): which trays the stack shows, what a tray or a key means, and the
 * order of the cards. Pure: no Vue, no store, no DOM.
 *
 * The steps are the clarify panel's (`shared/clarify.js`, `{step, project}`), so both modes ask the
 * same questions and file through the same payloads. Only the first question looks different:
 * five trays with the keys 1–5 instead of the panel's letters.
 *
 *   null          Nächste (1) · Warten auf (2) · Irgendwann (3) · Erledigt (4) · Löschen (5); `p` Projekt
 *   'ctx'         the contexts; Zurück (0)
 *   'follow'      morgen · Freitag · nächste Woche · ohne Datum; Zurück
 *   'project'     the active projects (the first eight keyed), "Neues Projekt" last; Zurück
 *   'newproject'  the name field, and Zurück
 *   'projctx'     the first action's context; Zurück back to the projects
 *
 * A tray is `{to, key, label, hint, n, mono}`; `to` names it: `next` `waiting` `someday` `done`
 * `delete`, `ctx:@x`, `day:YYYY-MM-DD` (`day:` for none), `proj:Name`, `newproj`, `back`.
 */

import { NO_STEP, pickChoice, stepBack, stepChoices } from './clarify.js'
import { hasText, t } from './i18n.js'

/** A context's hint under its name (06 `ctxhint.*`: `@computer` "am Rechner"), or none for a context of the user's own. */
const ctxHint = (ctx) => {
  const key = `ctxhint.${ctx.replace(/^@/, '')}`
  return hasText(key) ? t(key) : ''
}

/** The first question's trays, 06's order and keys. */
export const TRAYS = Object.freeze([
  { to: 'next', key: '1', label: 'list.next', hint: 'stack.hint.next' },
  { to: 'waiting', key: '2', label: 'list.waiting', hint: 'stack.hint.waiting' },
  { to: 'someday', key: '3', label: 'list.someday', hint: 'stack.hint.someday' },
  { to: 'done', key: '4', label: 'stack.done', hint: 'stack.hint.done' },
  { to: 'delete', key: '5', label: 'stack.delete', hint: 'stack.hint.delete' },
])

/** The trays a first-question key files into, by key (`1`–`5`). */
const TRAY_BY_KEY = Object.fromEntries(TRAYS.map((tray) => [tray.key, tray.to]))

/** How many projects the project step keys (`1`–`8`); "Neues Projekt" takes the next digit. */
export const KEYED_PROJECTS = 8

/** Keys that go one step back while a step is open. */
const BACK_KEYS = ['0', 'Escape', 'Backspace']

const back = () => ({ to: 'back', key: '0', label: t('stack.back'), hint: t('stack.hint.back'), n: null, mono: false })

/**
 * The trays the stack shows for a step.
 *
 * @param {{step: string|null, project: string|null}} state
 * @param {{contexts: string[], projects: string[], today: string}} sources as `stepChoices`
 * @param {{lists?: Object<string, number>, contexts?: Object<string, number>, projects?: Object<string, number>}} [counts]
 *   the numbers on the trays: per first-question tray (`next`, `waiting`, …), per context (its
 *   Nächste todos), per project (its next actions)
 * @returns {Array<{to: string, key: string|null, label: string, hint: string, n: number|null, mono: boolean}>}
 */
export function stackTrays(state, sources, counts = {}) {
  switch (state.step) {
    case null:
      return TRAYS.map((tray) => ({
        to: tray.to, key: tray.key, label: t(tray.label), hint: t(tray.hint), n: counts.lists?.[tray.to] ?? null, mono: false,
      }))
    case 'ctx':
    case 'projctx':
      return [
        ...stepChoices(state, sources).map((c) => ({
          to: `ctx:${c.value}`, key: c.key, label: c.label, hint: ctxHint(c.value), n: counts.contexts?.[c.value] ?? null, mono: true,
        })),
        back(),
      ]
    case 'follow':
      return [
        ...stepChoices(state, sources).map((c) => ({ to: `day:${c.value}`, key: c.key, label: c.label, hint: c.hint, n: null, mono: false })),
        back(),
      ]
    case 'project': {
      const projects = sources.projects.map((name, i) => {
        const n = counts.projects?.[name] ?? 0
        return {
          to: `proj:${name}`, key: i < KEYED_PROJECTS ? String(i + 1) : null, label: name,
          hint: t('stack.projNext', { n }), n: null, mono: false,
        }
      })
      const fresh = {
        to: 'newproj', key: String(Math.min(projects.length, KEYED_PROJECTS) + 1), label: t('cl.newProject'),
        hint: t('stack.hint.newProj'), n: null, mono: false,
      }
      return [...projects, fresh, back()]
    }
    case 'newproject':
      return [back()]
    default:
      return []
  }
}

const QUESTIONS = { ctx: 'stack.q.ctx', follow: 'stack.q.follow', project: 'stack.q.project', newproject: 'stack.q.newProj', projctx: 'stack.q.projctx' }

/**
 * The question above the trays: `[before, emphasised, after]` ("Nächste · " **wo erledigst du
 * das?**), or the first question as plain text. Joined, it names the trays for screen readers.
 *
 * @param {{step: string|null, project: string|null}} state
 * @returns {string[]}
 */
export function stackQuestion(state) {
  const key = QUESTIONS[state.step]
  return key ? t(key, { p: state.project }) : ['', '', t('stack.q.what')]
}

/**
 * A tray's accessible name: what it shows — the name, the hint (the follow-up's date, a project's
 * next actions), the count — and its key: "Freitag, Fr 06.11. (Taste 2)".
 *
 * @param {{label: string, hint: string, n: number|null, key: string|null}} tray
 */
export function trayName(tray) {
  const parts = [tray.label, tray.hint, tray.n != null ? t('stack.inTray', { n: tray.n }) : ''].filter(Boolean)
  const name = parts.join(', ')
  return tray.key ? `${name} (${t('stack.key', { k: tray.key })})` : name
}

/** Zurück: from a project's context or a new name to the projects, else to the first question. */
export const stackBack = stepBack

/**
 * A tray chosen (a key, a tap, a drop).
 *
 * @param {{step: string|null, project: string|null}} state
 * @param {string} to the tray's name
 * @returns {null | {state: object} | {file: {to: string, opts: object}}} the next step, or what to
 *   file (`gtd.clarify(uuid, to, opts)`); null when the tray means nothing in this step
 */
export function stackPick(state, to) {
  if (to === 'back') return state.step ? { state: stackBack(state) } : null
  const [kind, arg = ''] = String(to).split(/:(.*)/s)
  switch (state.step) {
    case null:
      if (to === 'next') return { state: { step: 'ctx', project: null } }
      if (to === 'waiting') return { state: { step: 'follow', project: null } }
      if (to === 'project') return { state: { step: 'project', project: null } }
      if (['someday', 'done', 'delete'].includes(to)) return { file: { to, opts: {} } }
      return null
    case 'ctx':
    case 'projctx':
      return kind === 'ctx' && arg ? pickChoice(state, { value: arg }) : null
    case 'follow':
      return kind === 'day' ? pickChoice(state, { value: arg }) : null
    case 'project':
      if (to === 'newproj') return { state: { step: 'newproject', project: null } }
      return kind === 'proj' && arg ? pickChoice(state, { value: arg }) : null
    default:
      return null
  }
}

/**
 * The tray a key chooses, or null when the key means nothing here.
 *
 * @param {{step: string|null}} state
 * @param {string} key `KeyboardEvent.key`
 * @param {Array<{to: string, key: string|null}>} trays what `stackTrays` gave for the state
 */
export function stackKey(state, key, trays) {
  if (!state.step) {
    if (key === 'p') return 'project'
    return TRAY_BY_KEY[key] ?? null
  }
  if (BACK_KEYS.includes(key)) return 'back'
  if (state.step === 'project' && key === 'n') return 'newproj'
  if (!/^[1-9]$/.test(key)) return null
  return trays.find((tray) => tray.key === key && tray.to !== 'back')?.to ?? null
}

/**
 * The step that asks what a refused filing still needs (`NeedsAnswer.what`): a context opens the
 * context question (for a project its first action's); anything else is not the stack's to ask.
 *
 * @param {string} what
 * @param {{step: string|null, project: string|null}} [state] the state the filing came from
 * @returns {{step: string, project: string|null}|null}
 */
export function needsStep(what, state = NO_STEP) {
  if (what !== 'context') return null
  return state.project ? { step: 'projctx', project: state.project } : { step: 'ctx', project: null }
}

/**
 * The order of the cards: the Inbox's order, skipped ones at the end (in the order they were
 * skipped), and on top the first of `keep` that is still in the Inbox — a card back from its tray,
 * then the card that was on top, so a capture arriving from elsewhere goes under the card being
 * worked on instead of displacing it. Uuids held from before a capture was named are followed to
 * its server uuid (`uuidNow`).
 *
 * @param {string[]} ids the Inbox's uuids, newest first
 * @param {string[]} skipped uuids skipped with `→`, oldest skip first
 * @param {string|null|Array<string|null>} keep the card(s) to keep on top, first wins
 * @param {(uuid: string) => string} [uuidNow]
 * @returns {string[]}
 */
export function stackOrder(ids, skipped = [], keep = null, uuidNow = (id) => id) {
  const present = new Set(ids)
  const late = [...new Set(skipped.map(uuidNow))].filter((id) => present.has(id))
  const lateSet = new Set(late)
  const order = [...ids.filter((id) => !lateSet.has(id)), ...late]
  const first = [keep].flat().map((id) => id && uuidNow(id)).find((id) => id && present.has(id))
  if (!first) return order
  return [first, ...order.filter((id) => id !== first)]
}

/**
 * Which filed cards Rückgängig has brought back into the Inbox, and which are still out.
 *
 * @param {Array<{uuid: string, tray: string}>} history the cards filed here, oldest first
 * @param {string[]} ids the Inbox's uuids
 * @param {(uuid: string) => string} [uuidNow] a capture's server uuid for its `local:…` one
 * @returns {{back: Array<{uuid: string, tray: string}>, out: Array<{uuid: string, tray: string}>}}
 *   `back` with their uuids as the Inbox has them now
 */
export function returnedCards(history, ids, uuidNow = (id) => id) {
  const present = new Set(ids)
  const now = history.map((h) => ({ ...h, uuid: uuidNow(h.uuid) }))
  return { back: now.filter((h) => present.has(h.uuid)), out: now.filter((h) => !present.has(h.uuid)) }
}

/**
 * The first-question tray a filed card went into, for its flight back on Rückgängig: an answer
 * of Nächste or a project's context lands in Nächste, a follow-up day in Warten auf.
 *
 * @param {string} to the tray the card was dropped on last
 */
export function trayOfFiling(to) {
  if (String(to).startsWith('ctx:') || String(to).startsWith('proj')) return 'next'
  if (String(to).startsWith('day:')) return 'waiting'
  return to
}
