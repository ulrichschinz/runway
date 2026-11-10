<script setup>
/**
 * Inbox, list mode (06 `renderHead('inbox')`, `clarifyPanel`; plan M8): what came in, newest
 * first, with when it was captured, and the clarify panel for the cursor row — in the margin
 * column on wide screens, docked beside the list at 761–1180 px, as a sheet on the phone once a
 * row is tapped (it closes with each filing, so the notice's Rückgängig stays in reach). Its keys
 * (`a` `w` `v` `p`, then the answer; `x`, `Entf`, `Esc`) work only while the panel is shown — not
 * while a todo's detail takes its place — so nothing is filed unseen. Empty: "Inbox ist leer." and the way to Nächste. The card stack (M10)
 * comes later.
 */
import { computed, ref, watch } from 'vue'
import { PHONE, useMedia } from '../../composables/useMedia.js'
import { t } from '../../shared/i18n.js'
import { entryInfo } from '../../shared/rowMeta.js'
import ClarifyPanel from '../components/ClarifyPanel.vue'
import ListFrame from '../components/ListFrame.vue'
import { useGtdStore } from '../stores/gtd.js'
import { useClarify } from '../useClarify.js'

const gtd = useGtdStore()
const phone = useMedia(PHONE)
const list = ref(null)
/** The phone: the panel is a sheet, open after a tap on a row until it is closed. */
const sheet = ref(false)

const empty = computed(() => gtd.loaded && gtd.inbox.length === 0)
const eyebrow = computed(() => {
  if (!gtd.today) return [t('list.inbox')]
  if (empty.value) return [t('list.inbox'), '0', t('stand', { t: gtd.stand })]
  const oldest = gtd.inbox[gtd.inbox.length - 1]
  return [t('list.inbox'), t('inbox.open', { n: gtd.inbox.length }), t('inbox.oldest', { d: entryInfo(oldest, gtd.today) })]
})
const sections = computed(() => (gtd.today && !empty.value ? [{ key: 'inbox', kind: 'inbox', tasks: gtd.inbox }] : []))

/** The item being clarified: the cursor row (ListFrame holds it on a row on wide screens). */
const target = computed(() => gtd.inbox.find((x) => x.uuid === list.value?.cursor) ?? null)
/** Shown, and so its keys live: not while a todo's detail takes the panel's place, nor during a search. */
const shown = computed(() => !!gtd.today && !!target.value && !list.value?.detailOpen && !list.value?.searching
  && (!phone.value || sheet.value))
/** A filing leaves the list; on the phone the sheet closes with it, so the notice's Rückgängig is in reach. */
function leave(...args) {
  const op = list.value.leave(...args)
  if (op && phone.value) sheet.value = false
  return op
}
const clarify = useClarify({ target, leave })
// Hidden (a detail opened, the sheet closed): the open question goes, so none is answered unseen.
watch(shown, (on) => {
  if (!on) clarify.reset()
})

const scopes = computed(() => {
  if (!shown.value) return []
  const step = clarify.step.value
  return [...(step === 'project' ? ['stepProject'] : []), ...(step ? ['step'] : []), 'inbox']
})

/** Open the todo's detail to edit its text (`e`, "Text ändern"). */
function edit() {
  if (target.value) list.value.open(target.value.uuid, { edit: true })
}

const answer = (key) => () => clarify.answer(key)
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
  'step.back': () => clarify.back(),
}
/** The palette offers the panel's questions for the item, not the rows' list moves (they ask the same). */
const offers = () => ({
  'move.next': false, 'move.waiting': false, 'move.someday': false,
  ...(target.value ? Object.fromEntries(['next', 'waiting', 'someday', 'project'].map((k) => [`clarify.${k}`, true])) : {}),
})
</script>

<template>
  <ListFrame
    ref="list" :eyebrow="eyebrow" :heading="t(empty ? 'h.inboxEmpty' : 'h.inbox')" :sections="sections" :plannable="false"
    :scopes="scopes" :keys="keys" :offers="offers" :hold-cursor="!phone" select-only :panel-label="t('cl.title')"
    @select="sheet = phone" @close-panel="sheet = false"
  >
    <template v-if="empty">
      <p class="lead">{{ t('inbox.zeroLead') }}</p>
      <RouterLink to="/next" class="pill">{{ t('inbox.toNext') }}</RouterLink>
    </template>
    <p v-else-if="gtd.today && !phone" class="lead">{{ t('inbox.leadList') }}</p>
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
.pill {
  display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: var(--rw-radius-pill);
  border: 1px solid var(--rw-rule-strong); font-size: 13.5px; font-weight: 500;
}
.pill:hover { background: var(--rw-hover); }
</style>
