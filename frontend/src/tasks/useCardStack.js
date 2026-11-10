import { computed, ref, watch } from 'vue'
import { fieldEdit } from '../shared/detailFields.js'
import { NeedsAnswer } from '../shared/gtdRules.js'
import { needsStep, returnedCards, stackKey, stackOrder, stackPick, stackTrays, trayOfFiling } from '../shared/stackSteps.js'
import { useGtdStore } from './stores/gtd.js'
import { useClarify } from './useClarify.js'

/** How many filed cards Rückgängig can still bring back out of their trays. */
const HISTORY = 20

/**
 * The card stack's state (06 `stack.js` `order`, `act`, `answer`, `cancel`, `skip`, `returnCard`;
 * plan M10, brief 0057): the order of the cards, the open step, the trays, and what a tray does.
 * The rules are pure (`shared/stackSteps.js`); filing is the clarify panel's own (`useClarify`, the
 * list page's `leave`, so the same notice and Rückgängig). `CardStack.vue` shows it and moves the
 * card.
 *
 * @param {object} options
 * @param {{value: object[]}} options.inbox (a computed) the Inbox, newest first
 * @param {(uuid: string, how: string, write: () => object|null, text: string) => object|null} options.leave
 * @param {(tray: string) => void} [options.onReturn] a filed card is back (Rückgängig): it should
 *   fly out of `tray`, a first-question tray
 */
export function useCardStack({ inbox, leave, onReturn = () => {} }) {
  const gtd = useGtdStore()
  /** Uuids skipped with `→`, oldest skip first: they go to the bottom. */
  const skipped = ref([])
  /** A card back from its tray goes on top. */
  const pinned = ref(null)
  /**
   * The card on top, kept there while it is in the Inbox: a capture from the phone or a refresh
   * goes under it, so no step, drag or edit ever lands on a card that took its place. Written only
   * by `order` itself (and cleared by `skip` and `reset`), so it is no ref.
   */
  let held = null
  /** How many cards were filed since the stack was shown ("2 von 5"). */
  const processed = ref(0)
  /** `{uuid, tray}` of the cards filed here, for their way back on Rückgängig. */
  let history = []

  const order = computed(() => {
    const byId = new Map(inbox.value.map((x) => [x.uuid, x]))
    const ids = stackOrder([...byId.keys()], skipped.value, [pinned.value, held], gtd.uuidNow)
    held = ids[0] ?? null
    return ids.map((id) => byId.get(id))
  })
  const top = computed(() => order.value[0] ?? null)

  const clarify = useClarify({ target: top, leave })

  const counts = computed(() => {
    const projects = {}
    for (const x of gtd.next) if (x.project) projects[x.project] = (projects[x.project] ?? 0) + 1
    return {
      lists: { next: gtd.next.length, waiting: gtd.waiting.length, someday: gtd.someday.length, done: gtd.doneToday.length },
      contexts: gtd.contextCount.byContext,
      projects,
    }
  })
  const trays = computed(() => (gtd.today ? stackTrays(clarify.state.value, clarify.sources.value, counts.value) : []))

  // A card filed here is back in the Inbox (Rückgängig from the notice, `z`, the palette): on top,
  // and out of the tray it went into.
  // A capture filed before the server named it comes back under its server uuid (`uuidNow`).
  watch(() => inbox.value.map((x) => x.uuid), (ids) => {
    const { back, out } = returnedCards(history, ids, gtd.uuidNow)
    if (!back.length) return
    history = out
    const last = back[back.length - 1]
    pinned.value = last.uuid
    processed.value = Math.max(0, processed.value - back.length)
    clarify.reset()
    onReturn(last.tray)
  })

  /**
   * A tray chosen.
   * @returns {'filed'|'step'|null} filed (the card leaves), a step opened or closed, or nothing
   */
  function pick(to) {
    const item = top.value
    if (!item) return null
    const from = clarify.state.value
    const result = stackPick(from, to)
    if (!result) return null
    if (result.state) {
      clarify.state.value = result.state
      clarify.nameError.value = ''
      return 'step'
    }
    let op
    try {
      op = clarify.file(result.file.to, result.file.opts)
    } catch (error) {
      if (!(error instanceof NeedsAnswer)) throw error
      const step = needsStep(error.what, from)
      if (!step) return null
      clarify.state.value = step
      return 'step'
    }
    if (!op) return null
    history = [...history, { uuid: item.uuid, tray: trayOfFiling(to) }].slice(-HISTORY)
    processed.value += 1
    skipped.value = skipped.value.filter((id) => gtd.uuidNow(id) !== item.uuid)
    if (pinned.value && gtd.uuidNow(pinned.value) === item.uuid) pinned.value = null
    return 'filed'
  }

  /** `→`: the top card goes to the bottom. @returns {boolean} whether there was another card */
  function skip() {
    const item = top.value
    if (!item || clarify.state.value.step || order.value.length < 2) return false
    held = null
    skipped.value = [...skipped.value.filter((id) => gtd.uuidNow(id) !== item.uuid), item.uuid]
    if (pinned.value && gtd.uuidNow(pinned.value) === item.uuid) pinned.value = null
    return true
  }

  /** The card's text edited in place (`e`): sent like the detail's text edit. */
  function rename(uuid, text) {
    const id = gtd.uuidNow(uuid)
    const item = order.value.find((x) => x.uuid === id)
    const body = item && fieldEdit(item, { description: text })
    if (body) gtd.update(id, body)
  }

  /** The stack was hidden or shown again: a fresh count, no open question, no skips. */
  function reset() {
    held = null
    skipped.value = []
    pinned.value = null
    processed.value = 0
    history = []
    clarify.reset()
  }

  return {
    order,
    top,
    processed,
    state: clarify.state,
    step: clarify.step,
    trays,
    nameError: clarify.nameError,
    pick,
    /** The tray a key chooses here, or null. */
    trayFor: (key) => stackKey(clarify.state.value, key, trays.value),
    skip,
    rename,
    nameProject: clarify.nameProject,
    reset,
  }
}
