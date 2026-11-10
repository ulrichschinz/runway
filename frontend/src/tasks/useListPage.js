import { nextTick, ref, toValue, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useKeymap } from '../composables/useKeymap.js'
import { moveLabel } from '../shared/clarify.js'
import { visibleCursor } from '../shared/commands.js'
import { NeedsAnswer } from '../shared/gtdRules.js'
import { t } from '../shared/i18n.js'
import { LISTS, PLACES } from '../shared/navigation.js'
import { showNotice, undoNotice } from './notice.js'
import { useGtdStore } from './stores/gtd.js'

/** A leaving row's mark is dropped after this, should its element never have left. */
const LEAVE_MARK_MS = 1000

/**
 * What every list page does with its rows (06 `complete`, `moveFocus`, `focusAfter`,
 * `setList`, the keydown handler): the keyboard cursor, ticking off and deleting through the
 * outbox hold with "Erledigt · Rückgängig" / "Gelöscht · Rückgängig", moving to another list
 * with `m` then `n` / `w` / `v` ("→ Nächste · @computer · Rückgängig", plan M8), planning for
 * today with `t`, and the keys of the command table.
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
 * @param {boolean} [options.plannable] whether `t` plans a todo for today here (not in the Inbox)
 * @param {boolean|(() => boolean)} [options.holdCursor] the cursor never leaves the rows while
 *   there are some (the Inbox: its clarify panel files the cursor row)
 * @param {(uuid: string, how: {edit?: boolean, ask?: string}) => void} [options.onOpen] opens a
 *   todo's detail (`Enter`/`o`; `e` opens it to edit the text; `ask` names the question a move
 *   needs answered there: `'context'` or `'legacyTag'`)
 * @param {(uuid: string) => void} [options.onMove] the cursor moved to a row by `j` / `k`
 */
export function useListPage({
  rows, scopes, keys = {}, plannable = true, holdCursor = false, onOpen = () => {}, onMove = () => {},
}) {
  const gtd = useGtdStore()
  const router = useRouter()
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
   * @returns {object|null} the op
   */
  function leave(uuid, how, write, text) {
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
    showNotice(text, () => gtd.undo(op))
    return op
  }

  /** Tick off ('done') or delete a todo. */
  function finish(uuid, how) {
    const write = how === 'delete' ? () => gtd.remove(uuid) : () => gtd.complete(uuid)
    leave(uuid, how, write, t(how === 'delete' ? 'notice.deleted' : 'notice.done'))
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

  const go = Object.fromEntries([...LISTS, ...PLACES].map((item) => [`go.${item.key}`, () => router.push(item.to)]))
  const onCursor = (fn) => () => {
    const uuid = visibleCursor(visibleIds(), cursor.value)
    if (uuid) fn(uuid)
  }
  useKeymap(
    {
      ...go,
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
