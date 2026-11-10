import { nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useKeymap } from '../composables/useKeymap.js'
import { visibleCursor } from '../shared/commands.js'
import { t } from '../shared/i18n.js'
import { LISTS, PLACES } from '../shared/navigation.js'
import { showNotice, undoNotice } from './notice.js'
import { useGtdStore } from './stores/gtd.js'

/** A leaving row's mark is dropped after this, should its element never have left. */
const LEAVE_MARK_MS = 1000

/**
 * What every list page does with its rows (06 `complete`, `moveFocus`, `focusAfter`, the
 * keydown handler): the keyboard cursor, ticking off and deleting through the outbox hold
 * with "Erledigt · Rückgängig" / "Gelöscht · Rückgängig", planning for today with `t`, and
 * the keys of the command table.
 *
 * The write goes to the store first — the done is in the stored hold before anything moves —
 * and the row leaves the list in the same render. `leaving` tells the list's leave transition
 * how the row goes ('done' strikes in coral, 'delete' in grey).
 *
 * @param {object} options
 * @param {{value: object[]}} options.rows (a computed) the page's todos in screen order
 *   (the ones the cursor visits)
 * @param {string[]|(() => string[])} options.scopes command scopes (`rows`, …)
 * @param {Object<string, Function>} [options.keys] the page's own commands
 * @param {boolean} [options.plannable] whether `t` plans a todo for today here (not in the Inbox)
 * @param {(uuid: string, how: {edit: boolean}) => void} [options.onOpen] opens a todo's detail
 *   (`Enter`/`o`; `e` opens it to edit the text)
 * @param {(uuid: string) => void} [options.onMove] the cursor moved to a row by `j` / `k`
 */
export function useListPage({ rows, scopes, keys = {}, plannable = true, onOpen = () => {}, onMove = () => {} }) {
  const gtd = useGtdStore()
  const router = useRouter()
  const cursor = ref(null)
  const leaving = new Map()
  const visibleIds = () => rows.value.map((x) => x.uuid)
  watch(visibleIds, (ids) => {
    cursor.value = visibleCursor(ids, cursor.value)
  })

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

  /** Tick off ('done') or delete a todo; the cursor moves on to the next row. */
  function finish(uuid, how) {
    const ids = rows.value.map((x) => x.uuid)
    const i = ids.indexOf(uuid)
    const op = how === 'delete' ? gtd.remove(uuid) : gtd.complete(uuid)
    if (!op) return
    leaving.set(uuid, how)
    setTimeout(() => leaving.delete(uuid), LEAVE_MARK_MS)
    const focused = document.activeElement?.closest?.('[data-row]')?.dataset.row === uuid
    if (cursor.value === uuid || focused) {
      cursor.value = ids[i + 1] ?? ids[i - 1] ?? null
      if (focused) focusRow(cursor.value)
    }
    showNotice(t(how === 'delete' ? 'notice.deleted' : 'notice.done'), () => gtd.undo(op))
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
    plan,
    focusRow,
    retry: (opId) => gtd.retry(opId),
  }
}
