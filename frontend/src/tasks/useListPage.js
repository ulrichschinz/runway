import { nextTick, ref, toValue, watch } from 'vue'
import { useKeymap } from '../composables/useKeymap.js'
import { readyBead } from '../layout/lens/useBeadFlight.js'
import { moveLabel } from '../shared/clarify.js'
import { visibleCursor } from '../shared/commands.js'
import { countsAsPlanned } from '../shared/dayProgress.js'
import { NeedsAnswer, listOf, planPayload } from '../shared/gtdRules.js'
import { t } from '../shared/i18n.js'
import { notice, showNotice, undoNotice } from './notice.js'
import { useGtdStore } from './stores/gtd.js'

/** A leaving row's mark is dropped after this, should its element never have left. */
const LEAVE_MARK_MS = 1000

/**
 * What every list page does with its rows (06 `complete`, `moveFocus`, `focusAfter`,
 * `setList`, the keydown handler): the keyboard cursor, ticking off and deleting through the
 * outbox hold with "Erledigt · Rückgängig" / "Gelöscht · Rückgängig", moving to another list
 * with `m` then `n` / `w` / `v` ("→ Nächste · @computer · Rückgängig", plan M8), planning for
 * today with `t`, and the keys of the command table. What the keys do to the cursor row the
 * command palette offers too, labelled with the todo's text ("Abhaken: Belege Oktober hochladen").
 *
 * Every row that leaves by an action goes through `leave`: the write to the store first — a
 * done is in the stored hold, a move sent, before anything moves; a move that needs an answer
 * throws `NeedsAnswer` before anything happened — then the row leaves the list in the same
 * render. `leaving` tells the list's leave transition how ('done' strikes in coral, 'delete' in
 * grey, 'filed' fades).
 *
 * @param {object} options
 * @param {{value: object[]}} options.rows (a computed) the page's todos in screen order
 *   (the ones the cursor visits)
 * @param {string[]|(() => string[])} options.scopes command scopes (`rows`, …)
 * @param {Object<string, Function>} [options.keys] the page's own commands
 * @param {() => Object<string, boolean|object>} [options.offers] the page's own palette offers
 *   (see `paletteCommands`); they win over the rows' offers
 * @param {boolean} [options.plannable] whether `t` plans a todo for today here (not in the Inbox)
 * @param {boolean|(() => boolean)} [options.holdCursor] the cursor never leaves the rows while
 *   there are some (the Inbox: its clarify panel files the cursor row)
 * @param {(uuid: string, how: {edit?: boolean, ask?: string}) => void} [options.onOpen] opens a
 *   todo's detail (`Enter`/`o`; `e` opens it to edit the text; `ask` names the question a move
 *   needs answered there: `'context'` or `'legacyTag'`)
 * @param {(uuid: string) => void} [options.onMove] the cursor moved to a row by `j` / `k`
 */
export function useListPage({
  rows, scopes, keys = {}, offers = () => ({}), plannable = true, holdCursor = false, onOpen = () => {}, onMove = () => {},
}) {
  const gtd = useGtdStore()
  const cursor = ref(null)
  const leaving = new Map()
  const visibleIds = () => rows.value.map((x) => x.uuid)
  watch([visibleIds, () => toValue(holdCursor)], ([ids, hold]) => {
    cursor.value = visibleCursor(ids, cursor.value) ?? (hold ? ids[0] ?? null : null)
  }, { immediate: true })

  const rowEl = (uuid) => document.querySelector(`[data-row="${CSS.escape(uuid)}"]`)

  function focusRow(uuid) {
    nextTick(() => {
      const el = uuid && rowEl(uuid)
      if (!el) return
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'nearest' })
    })
  }

  function moveCursor(step) {
    const ids = rows.value.map((x) => x.uuid)
    if (!ids.length) return
    const i = ids.indexOf(cursor.value)
    cursor.value = ids[Math.max(0, Math.min(ids.length - 1, i < 0 ? 0 : i + step))]
    focusRow(cursor.value)
    onMove(cursor.value)
  }

  /**
   * A row leaves by an action: `write` sends it (and may throw `NeedsAnswer` first); once the
   * page has rendered without the row, the cursor moves on to the next one (on Alle a moved row
   * stays, and so does the cursor); the notice offers Rückgängig.
   *
   * @param {string} uuid
   * @param {'done'|'delete'|'filed'} how
   * @param {() => object|null} write the store action; its op, or null when nothing was sent
   * @param {string} text the notice, through `t()`
   * @param {() => void} [onUndo] also run on Rückgängig (the bead's flight is called back)
   * @returns {object|null} the op
   */
  function leave(uuid, how, write, text, onUndo = null) {
    const ids = visibleIds()
    const i = ids.indexOf(uuid)
    const focused = document.activeElement?.closest?.('[data-row]')?.dataset.row === uuid
    const had = cursor.value === uuid
    const op = write()
    if (!op) return null
    leaving.set(uuid, how)
    setTimeout(() => leaving.delete(uuid), LEAVE_MARK_MS)
    nextTick(() => {
      const now = visibleIds()
      if (now.includes(uuid) || !(had || focused)) return
      cursor.value = [...ids.slice(i + 1), ...ids.slice(0, i).reverse()].find((id) => now.includes(id)) ?? null
      if (focused) focusRow(cursor.value)
    })
    showNotice(text, () => {
      onUndo?.()
      return gtd.undo(op)
    })
    return op
  }

  /**
   * Tick off ('done') or delete a todo. A todo that counts for today sends the bead from its ring
   * into the Tageslinse (plan M11), decided before the row leaves and launched once the hold is
   * stored; the level it rises to is the store's progress when it lands. Rückgängig while it flies
   * calls it back, so nothing lands for a tick that was taken back.
   */
  function finish(uuid, how) {
    const task = how === 'done' ? rows.value.find((x) => x.uuid === uuid) : null
    const bead = task && gtd.today
      ? readyBead(rowEl(uuid)?.querySelector('.tick'), countsAsPlanned(task, gtd.today))
      : null
    const write = how === 'delete' ? () => gtd.remove(uuid) : () => gtd.complete(uuid)
    let flight = null
    const op = leave(uuid, how, write, t(how === 'delete' ? 'notice.deleted' : 'notice.done'), () => flight?.cancel())
    if (op && bead) flight = bead(() => gtd.progress?.level ?? 0)
  }

  /** `m` then `n` / `w` / `v`: another list; a move that needs an answer opens the detail asking it. */
  function move(uuid, list) {
    const task = rows.value.find((x) => x.uuid === uuid)
    if (!task) return
    try {
      leave(uuid, 'filed', () => gtd.setList(uuid, list), t('notice.moved', { list: moveLabel(task, list) }))
    } catch (error) {
      if (!(error instanceof NeedsAnswer)) throw error
      onOpen(uuid, { ask: error.what })
    }
  }

  /** `t`: plan for today, or take it off today's plan; refused for a waiting todo. */
  function plan(uuid) {
    const op = gtd.togglePlanned(uuid)
    if (op) showNotice(t(op.body.scheduled ? 'notice.planned' : 'notice.unplanned'), () => gtd.undo(op))
  }

  /** `s`: start a todo, or pause the one that runs. */
  function toggleStart(uuid) {
    const task = rows.value.find((x) => x.uuid === uuid)
    if (task) (task.start ? gtd.stop : gtd.start)(uuid)
  }

  const onCursor = (fn) => () => {
    const uuid = visibleCursor(visibleIds(), cursor.value)
    if (uuid) fn(uuid)
  }
  /** The cursor row's actions for the palette, with its text (and the list a move goes to). */
  function rowOffers() {
    const task = rows.value.find((x) => x.uuid === visibleCursor(visibleIds(), cursor.value))
    const offers = { undo: !!notice.value?.undo }
    if (!task) return offers
    const d = task.description
    const list = listOf(task)
    const planned = plannable && gtd.today ? planPayload(task, gtd.today) : null
    return {
      ...offers,
      open: { d },
      edit: { d },
      check: { d },
      delete: { d },
      start: { d, label: task.start ? 'pal.stop' : 'pal.start' },
      plan: planned ? { d, label: planned.scheduled ? 'pal.plan' : 'pal.unplan' } : false,
      ...Object.fromEntries(['next', 'waiting', 'someday'].map((to) => [
        `move.${to}`, to !== list && { d, l: t(`list.${to}`) },
      ])),
    }
  }

  useKeymap(
    {
      undo: undoNotice,
      'cursor.down': () => moveCursor(1),
      'cursor.up': () => moveCursor(-1),
      open: onCursor((uuid) => onOpen(uuid, { edit: false })),
      edit: onCursor((uuid) => onOpen(uuid, { edit: true })),
      start: onCursor(toggleStart),
      check: onCursor((uuid) => finish(uuid, 'done')),
      delete: onCursor((uuid) => finish(uuid, 'delete')),
      'move.next': onCursor((uuid) => move(uuid, 'next')),
      'move.waiting': onCursor((uuid) => move(uuid, 'waiting')),
      'move.someday': onCursor((uuid) => move(uuid, 'someday')),
      ...(plannable ? { plan: onCursor(plan) } : {}),
      ...keys,
    },
    scopes,
    () => ({ ...rowOffers(), ...offers() }),
  )

  return {
    cursor,
    leaving,
    select: (uuid) => {
      cursor.value = uuid
    },
    check: (uuid) => finish(uuid, 'done'),
    remove: (uuid) => finish(uuid, 'delete'),
    leave,
    plan,
    focusRow,
    retry: (opId) => gtd.retry(opId),
  }
}
