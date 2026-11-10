<script setup>
/**
 * Inbox (06 `renderHead('inbox')`, `clarifyPanel`, the stack; plan M8, M10): what came in, newest
 * first, with when it was captured — in one of two modes, "Liste · Stapel" in the head (`s`, the
 * palette), remembered per browser (`shared/inboxMode.js`; the stack on touch screens and phones,
 * the list elsewhere, until the person chooses).
 *
 * Liste: the rows, and the clarify panel for the cursor row — in the margin column on wide
 * screens, docked beside the list at 761–1180 px, as a sheet on the phone once a row is tapped (it
 * closes with each filing, so the notice's Rückgängig stays in reach). Its keys (`a` `w` `v` `p`,
 * then the answer; `x`, `Entf`, `Esc`) work only while the panel is shown — not while a todo's
 * detail takes its place — so nothing is filed unseen.
 *
 * Stapel (`CardStack.vue`, `useCardStack`): the top card and five trays, keys `1`–`5`, `p`, `e`,
 * `→`; a tray that needs an answer turns into the answers, `0` / `Esc` / `⌫` go back. Both modes
 * file through the same `useClarify` and the list page's `leave` (notice, Rückgängig).
 *
 * Empty: "Inbox ist leer." and the way to Nächste.
 */
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { PHONE, useMedia } from '../../composables/useMedia.js'
import { t } from '../../shared/i18n.js'
import { readInboxMode, writeInboxMode } from '../../shared/inboxMode.js'
import { entryInfo } from '../../shared/rowMeta.js'
import ClarifyPanel from '../components/ClarifyPanel.vue'
import ListFrame from '../components/ListFrame.vue'
import OptToggle from '../components/OptToggle.vue'
import { useGtdStore } from '../stores/gtd.js'
import { useCardStack } from '../useCardStack.js'
import { useClarify } from '../useClarify.js'

// The stack is a mode: its card, springs and trays load when it is first shown, so a desktop that
// keeps the list never fetches them (entry budget, plan §5). An index blind spot (BLIND-FE-002).
const CardStack = defineAsyncComponent(() => import('../components/CardStack.vue'))

const gtd = useGtdStore()
const phone = useMedia(PHONE)
const coarse = useMedia('(pointer: coarse)')
const reduced = useMedia('(prefers-reduced-motion: reduce)')
const list = ref(null)
const stackView = ref(null)
/** The phone: the panel is a sheet, open after a tap on a row until it is closed. */
const sheet = ref(false)

const mode = ref(readInboxMode({ coarse: coarse.value, phone: phone.value }))
function setMode(next) {
  if (next === mode.value) return
  mode.value = next
  writeInboxMode(next)
  sheet.value = false
}
const toggleMode = () => setMode(mode.value === 'stack' ? 'list' : 'stack')

const empty = computed(() => gtd.loaded && gtd.inbox.length === 0)
const hasItems = computed(() => !!gtd.today && gtd.inbox.length > 0)
const searching = computed(() => !!list.value?.searching)
/** The stack is on screen (and its keys live). */
const stackOn = computed(() => mode.value === 'stack' && hasItems.value && !searching.value)
const eyebrow = computed(() => {
  if (!gtd.today) return [t('list.inbox')]
  if (empty.value) return [t('list.inbox'), '0', t('stand', { t: gtd.stand })]
  const oldest = gtd.inbox[gtd.inbox.length - 1]
  return [t('list.inbox'), t('inbox.open', { n: gtd.inbox.length }), t('inbox.oldest', { d: entryInfo(oldest, gtd.today) })]
})
const sections = computed(() => (hasItems.value && mode.value === 'list' ? [{ key: 'inbox', kind: 'inbox', tasks: gtd.inbox }] : []))

/** A filing leaves the list; on the phone the sheet closes with it, so the notice's Rückgängig is in reach. */
function leave(...args) {
  const op = list.value.leave(...args)
  if (op && phone.value) sheet.value = false
  return op
}

// ── Liste: the clarify panel for the cursor row ─────────────────────────────────────
/** The item being clarified: the cursor row (ListFrame holds it on a row on wide screens). */
const target = computed(() => (mode.value === 'list' ? gtd.inbox.find((x) => x.uuid === list.value?.cursor) ?? null : null))
/** Shown, and so its keys live: not while a todo's detail takes the panel's place, nor during a search. */
const shown = computed(() => !!gtd.today && !!target.value && !list.value?.detailOpen && !searching.value
  && (!phone.value || sheet.value))
const clarify = useClarify({ target, leave })
// Hidden (a detail opened, the sheet closed): the open question goes, so none is answered unseen.
watch(shown, (on) => {
  if (!on) clarify.reset()
})

// ── Stapel ──────────────────────────────────────────────────────────────────────────
/** A tray a card is coming back out of while the stack is not mounted yet (the Inbox was empty). */
let returning = null
const deck = useCardStack({
  inbox: computed(() => gtd.inbox),
  leave,
  onReturn: (tray) => {
    if (stackView.value) stackView.value.returnFrom(tray)
    else returning = tray
  },
})
watch(stackView, (view) => {
  if (view && returning) view.returnFrom(returning)
  returning = null
}, { flush: 'post' })
// Chosen again, or back from a search: a fresh count, no open question. Not when the last card is
// filed — its Rückgängig still brings it back out of its tray, as card n of n.
watch(() => mode.value === 'stack' && !searching.value, () => {
  returning = null
  deck.reset()
})

// The last card filed from the keyboard: the stack is gone with the focus in it, so the focus and
// the screen reader go to "Alles geklärt" instead of the page's body.
const zeroLead = ref(null)
watch(empty, (on) => {
  if (!on || mode.value !== 'stack') return
  nextTick(() => {
    if (!document.activeElement || document.activeElement === document.body) zeroLead.value?.focus({ preventScroll: true })
  })
})

/** A key of the stack: the tray it chooses in the open step. */
function stackKey(key) {
  const to = deck.trayFor(key)
  if (to) stackView.value?.choose(to)
}
const choose = (to) => () => stackView.value?.choose(to)

const scopes = computed(() => {
  const page = hasItems.value ? ['inboxPage'] : []
  if (stackOn.value) {
    if (!deck.top.value) return page
    const step = deck.step.value
    if (!step) return ['stack', ...page]
    return [...(step === 'project' ? ['stepProject'] : []), 'stackStep', 'step', ...page]
  }
  if (!shown.value) return page
  const step = clarify.step.value
  return [...(step === 'project' ? ['stepProject'] : []), ...(step ? ['step'] : []), 'inbox', ...page]
})

/** Open the todo's detail to edit its text (`e`, "Text ändern"). */
function edit() {
  if (target.value) list.value.open(target.value.uuid, { edit: true })
}

const answer = (key) => () => (stackOn.value ? stackKey(key) : clarify.answer(key))
const keys = {
  'clarify.next': () => clarify.ask('next'),
  'clarify.waiting': () => clarify.ask('waiting'),
  'clarify.someday': () => clarify.ask('someday'),
  'clarify.project': () => clarify.ask('project'),
  // `m n|w|v` on an Inbox row: the same questions, never a move without its answer.
  'move.next': () => shown.value && clarify.ask('next'),
  'move.waiting': () => shown.value && clarify.ask('waiting'),
  'move.someday': () => shown.value && clarify.ask('someday'),
  ...Object.fromEntries(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => [`step.${k}`, answer(k)])),
  'step.new': answer('n'),
  'step.back': () => (stackOn.value ? stackView.value?.choose('back') : clarify.back()),
  'inbox.mode': toggleMode,
  ...Object.fromEntries(['next', 'waiting', 'someday', 'done', 'delete'].map((to) => [`tray.${to}`, choose(to)])),
  'stack.project': choose('project'),
  'stack.back': choose('back'),
  'stack.edit': () => stackView.value?.edit(),
  'stack.skip': () => stackView.value?.skip(),
}
/**
 * The palette: the mode switch; in list mode the panel's questions for the item (not the rows'
 * list moves, they ask the same); in stack mode the trays and the card's tools for the top card.
 */
const offers = () => {
  const base = { 'inbox.mode': hasItems.value && { label: mode.value === 'stack' ? 'pal.toList' : 'pal.toStack' } }
  const moves = { 'move.next': false, 'move.waiting': false, 'move.someday': false }
  if (stackOn.value) {
    const card = deck.top.value
    if (!card || deck.step.value) return { ...base, ...moves }
    const d = card.description
    return {
      ...base, ...moves,
      ...Object.fromEntries(['next', 'waiting', 'someday', 'done', 'delete'].map((to) => [`tray.${to}`, true])),
      'stack.project': true,
      'stack.edit': { d },
      'stack.skip': deck.order.value.length > 1 && { d },
    }
  }
  return {
    ...base, ...moves,
    ...(target.value ? Object.fromEntries(['next', 'waiting', 'someday', 'project'].map((k) => [`clarify.${k}`, true])) : {}),
  }
}
</script>

<template>
  <ListFrame
    ref="list" :eyebrow="eyebrow" :heading="t(empty ? 'h.inboxEmpty' : 'h.inbox')" :sections="sections" :plannable="false"
    :scopes="scopes" :keys="keys" :offers="offers" :hold-cursor="!phone" select-only :panel-label="t('cl.title')" :capture-focus="mode !== 'stack'"
    @select="sheet = phone" @close-panel="sheet = false"
  >
    <template v-if="hasItems && !phone" #aside>
      <div class="modes" role="group" :aria-label="t('inbox.mode')">
        <OptToggle :pressed="mode === 'list'" @click="setMode('list')">{{ t('inbox.list') }}</OptToggle>
        <OptToggle :pressed="mode === 'stack'" @click="setMode('stack')">{{ t('inbox.stack') }}</OptToggle>
        <kbd class="key" aria-hidden="true">s</kbd>
      </div>
    </template>
    <template v-else-if="hasItems" #head>
      <div class="modes phone" role="group" :aria-label="t('inbox.mode')">
        <OptToggle :pressed="mode === 'list'" @click="setMode('list')">{{ t('inbox.list') }}</OptToggle>
        <OptToggle :pressed="mode === 'stack'" @click="setMode('stack')">{{ t('inbox.stack') }}</OptToggle>
      </div>
    </template>
    <template v-if="empty">
      <p ref="zeroLead" class="lead" tabindex="-1">{{ t('inbox.zeroLead') }}</p>
      <RouterLink to="/next" class="pill">{{ t('inbox.toNext') }}</RouterLink>
    </template>
    <p v-else-if="gtd.today && !phone" class="lead">{{ t(mode === 'stack' ? 'inbox.leadStack' : 'inbox.leadList') }}</p>
    <CardStack
      v-if="stackOn" ref="stackView" :cards="deck.order.value" :processed="deck.processed.value"
      :captured="deck.top.value ? entryInfo(deck.top.value, gtd.today) : ''"
      :state="deck.state.value" :trays="deck.trays.value" :name-error="deck.nameError.value" :compact="phone || coarse"
      :reduced="reduced" :pick="deck.pick" :skip-card="deck.skip"
      @rename="deck.rename" @name="deck.nameProject" @retry="gtd.retry"
    />
    <template v-if="shown" #panel>
      <ClarifyPanel
        :task="target" :today="gtd.today" :left="gtd.inbox.length" :state="clarify.state.value"
        :choices="clarify.choices.value" :name-error="clarify.nameError.value"
        @ask="clarify.ask" @pick="clarify.pick" @file="clarify.file" @back="clarify.back" @new-project="clarify.answer('n')"
        @name="clarify.nameProject" @edit="edit" @retry="gtd.retry"
      />
    </template>
  </ListFrame>
</template>

<style scoped>
.lead { margin: 0 0 22px; max-width: 56ch; color: var(--rw-mute); font-size: 17px; line-height: 1.5; }
.lead:focus { outline: none; }
.pill {
  display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: var(--rw-radius-pill);
  border: 1px solid var(--rw-rule-strong); font-size: 13.5px; font-weight: 500;
}
.pill:hover { background: var(--rw-hover); }
.modes { display: inline-flex; gap: 6px; align-items: center; }
.modes.phone { margin-top: 12px; }
.key {
  display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 4px;
  border: 1px solid var(--rw-rule-strong); border-radius: var(--rw-radius-pill);
  font-family: var(--rw-font-mono); font-size: 10.5px; line-height: 1; color: var(--rw-mute);
}
@media (hover: none) { .key { display: none; } }
/* a touch screen wider than a phone (a tablet): the toggle is a 44 px target there too */
@media (pointer: coarse) { .modes :deep(.opt) { min-height: 44px; padding: 0 14px; } }
</style>
