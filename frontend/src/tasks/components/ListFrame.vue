<script setup>
/**
 * The frame every list page shares: AppFrame with the page's eyebrow, heading and chips, the
 * sections, the notice, and the row behaviour of `useListPage` (cursor, tick off, delete, plan,
 * keys), the capture line (`n` focuses it) and the open todo's detail (`?task=<uuid>`, plan M7:
 * a click on a row, `Enter`/`o`, `e` to edit its text; `Esc` closes it and the focus goes back to
 * the row). A page only says what its head shows and which sections it has. Slots: `top` (above
 * the eyebrow: a project's way back), `aside` (right of the heading: Nächste's caption), `byline`
 * (under the heading), `head` (under it), `chips`, default (above the list), `after` (under the list:
 * a project's plan where there is no margin column), and `panel` (the page's own panel while no
 * detail is open: the Inbox's clarify panel, a project's plan).
 *
 * While the `/` search has a query (plan M9, 06 `sectionsFor('search')`), the page steps aside: the
 * head says "Gefunden in allen Listen" with the hits by list, rows work as rows, and the page's own
 * head, chips, panel and keys rest until the search ends (`Esc`, "Suche beenden", leaving the page).
 *
 * The margin column's panels (plan M12, `frame.margin`) fill the frame's `margin` slot on every list
 * page: the column on wide screens, the Mehr sheet on the phone. `toggleToday()` opens them as the
 * page's panel instead (Nächste's lens box, 06 `ui.today`): in the column, docked at 761–1180 px, a
 * sheet on the phone. Heute and a todo's detail take turns (opening one closes the other); the
 * page's own panel goes before Heute. A todo the margin opens (Nachhaken) arrives with the focus in
 * its detail, as a row's does; on closing, the focus goes back to its margin row (on the phone "···").
 *
 * Exposes `cursor`, `select`, `leave` (`useListPage`), `open`, `detailOpen`, `searching`, `todayOpen`
 * and `toggleToday`, so a page's panel acts on the cursor row the way the rows do. Emits
 * `closePanel` with `{ today }` (whether Heute was open) when the page's panel or Heute should
 * close (`Esc`, "schließen", the scrim).
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppFrame from '../../layout/AppFrame.vue'
import NoticeBar from '../../layout/NoticeBar.vue'
import EmptyState from '../../layout/ui/EmptyState.vue'
import EyebrowLine from '../../layout/ui/EyebrowLine.vue'
import PageHeading from '../../layout/ui/PageHeading.vue'
import PillButton from '../../layout/ui/PillButton.vue'
import { searchQuery } from '../../composables/useCommands.js'
import { provideFrame, useFrame } from '../../composables/useFrame.js'
import { t } from '../../shared/i18n.js'
import { notice, undoNotice } from '../notice.js'
import { useGtdStore } from '../stores/gtd.js'
import { useListPage } from '../useListPage.js'
import { searchSections } from '../useTaskSearch.js'
import CaptureLine from './CaptureLine.vue'
import SectionList from './SectionList.vue'

// The detail is a chunk of its own, fetched when a todo is first opened (brief 0058: the entry's
// 130 kB budget while both UIs ship, after M11 added the Tageslinse).
const TaskDetail = defineAsyncComponent(() => import('./TaskDetail.vue'))

const props = defineProps({
  /** the eyebrow's parts after the `//` */
  eyebrow: { type: Array, required: true },
  /** the heading's `[before, accent, after]` */
  heading: { type: Array, required: true },
  /** the heading for screen readers only (Nächste on the phone) */
  headingHidden: { type: Boolean, default: false },
  /** see `SectionList.vue`; empty until the first snapshot */
  sections: { type: Array, required: true },
  /** command scopes besides `rows` (`next`, `all`) */
  scopes: { type: Array, default: () => [] },
  /** the page's own commands, by command id */
  keys: { type: Object, default: () => ({}) },
  /** the page's own palette offers, by command id (see `paletteCommands`) */
  offers: { type: Function, default: () => ({}) },
  plannable: { type: Boolean, default: true },
  /** the cursor stays on a row while there are rows (`useListPage`) */
  holdCursor: { type: Boolean, default: false },
  /** a click on a row only moves the cursor and emits `select` (the Inbox), instead of opening the detail */
  selectOnly: { type: Boolean, default: false },
  /** the accessible name of the page's own panel as a sheet (the detail's is "Todo") */
  panelLabel: { type: String, default: '' },
  /** the phone Inbox focuses the capture field on open (M6); the card stack keeps the keyboard down */
  captureFocus: { type: Boolean, default: true },
})
const emit = defineEmits(['select', 'closePanel'])

const frame = useFrame()
const gtd = useGtdStore()
const searching = computed(() => searchQuery.value.trim() !== '')
const shown = computed(() => {
  if (!searching.value) return props.sections
  return gtd.today ? searchSections(gtd, searchQuery.value) : []
})
const rows = computed(() => shown.value.filter((s) => s.kind !== 'done').flatMap((s) => s.tasks))
const searchEyebrow = computed(() => [
  t('search.title'), `»${searchQuery.value.trim()}«`, t('search.hits', { n: rows.value.length }),
])
const captureLine = ref(null)
/** The margin's panels as the page's panel (Nächste's lens box). */
const todayOpen = ref(false)
const todayClose = ref(null)
/** The page the margin is about; none while the search stands in for it (the lens and Nachhaken come back). */
const marginView = computed(() => (searching.value ? null : frame.props.value.view))

/** The todo whose detail is open, from the address. */
const openId = frame.taskId

/** The lens box: Heute opens (an open detail closes first, so Heute shows at once) or closes. */
function toggleToday() {
  const opening = !todayOpen.value || !!openId.value
  if (openId.value) frame.closeTask()
  todayOpen.value = opening
}
// Heute's "schließen" takes the focus once it shows (after the detail has gone, when one was open).
watch(todayClose, (el) => el?.focus())
// A detail that opens takes Heute's place for good, so Heute does not come back when it closes.
watch(openId, (uuid) => {
  if (uuid) todayOpen.value = false
})
/**
 * How the person opened the detail, for TaskDetail to act on once it shows the todo: `focus`
 * (a click, `Enter`), `edit` (`e`), or the question a move needs answered there (`context`,
 * `legacyTag`). A link or the cursor (`j` `k`) moves nothing.
 */
const arrival = ref(null)

function open(uuid, { edit = false, ask = null } = {}) {
  page.select(uuid)
  arrival.value = { uuid, how: ask ?? (edit ? 'edit' : 'focus') }
  if (openId.value !== uuid) frame.openTask(uuid)
}

/** The todo the margin opened last (a follow-up, not a row here): the focus goes back to its margin row. */
let fromMargin = null
function openFromMargin(uuid) {
  if (rows.value.some((x) => x.uuid === uuid)) {
    open(uuid)
    return
  }
  fromMargin = uuid
  arrival.value = { uuid, how: 'focus' }
  frame.openTask(uuid)
}
// The margin's panels (rendered inside this frame) open a todo the way a row does.
provideFrame({ ...frame, openTask: openFromMargin })

/**
 * Once the detail of a todo from the margin has closed: its margin row; on the phone, where the
 * Mehr sheet that showed it is gone, "···" (`data-more`, PhoneDock); else the cursor row.
 */
async function backFromMargin(uuid) {
  await new Promise((resolve) => {
    const stop = watch(openId, (id) => {
      if (id) return
      stop()
      resolve()
    }, { immediate: true })
  })
  await nextTick()
  const el = document.querySelector(`[data-follow="${CSS.escape(uuid)}"]`) ?? document.querySelector('[data-more]')
  if (el) el.focus()
  else page.focusRow(page.cursor.value)
}

function endSearch() {
  searchQuery.value = ''
}
// Leaving the page ends the search (06 `show`).
onBeforeUnmount(endSearch)

/** `⏎` or `↓` in the search field: the cursor on the first hit. */
function toHits() {
  const first = rows.value[0]?.uuid
  if (!first) return
  page.select(first)
  page.focusRow(first)
}

/**
 * `Esc`, "schließen", the scrim: the detail closes (the focus back on its row), else the search
 * ends, else the page's panel.
 */
function close() {
  const uuid = openId.value
  if (!uuid && searching.value) {
    endSearch()
    return
  }
  if (!uuid) {
    const today = todayOpen.value
    todayOpen.value = false
    emit('closePanel', { today })
    return
  }
  frame.closeTask()
  if (uuid === fromMargin && !rows.value.some((x) => x.uuid === uuid)) backFromMargin(uuid)
  else page.focusRow(uuid)
  fromMargin = null
}

/** A row was clicked: an open todo opens its detail, a done one (Alle) only takes the cursor. */
function onSelect(uuid) {
  const pending = rows.value.some((x) => x.uuid === uuid)
  const selectOnly = props.selectOnly && !searching.value
  if (pending && !selectOnly) open(uuid)
  else page.select(uuid)
  if (pending && selectOnly) emit('select', uuid)
}

/** Abhaken or Löschen in the detail: the list page's own action and notice; the focus goes to the next row. */
function finish(action, uuid) {
  action(uuid)
  // after `leave` has moved the cursor on, once the row is gone
  nextTick(() => page.focusRow(page.cursor.value))
}

const page = useListPage({
  rows,
  // While searching, the page's own scopes rest: the hits are rows of every list.
  scopes: () => (searching.value ? ['rows'] : [...props.scopes, 'rows']),
  keys: { capture: () => captureLine.value?.focus(), close, ...props.keys },
  offers: () => (searching.value ? {} : props.offers()),
  plannable: props.plannable,
  holdCursor: () => props.holdCursor && !searching.value,
  onOpen: open,
  // While a detail is open, the cursor takes it along (06 moveFocus).
  onMove: (uuid) => {
    if (openId.value && uuid !== openId.value) frame.openTask(uuid)
  },
})

// A todo ticked off or deleted (detail, `x`, `Entf`, swipe) takes its detail with it (06 focusAfter).
watch(() => !!openId.value && gtd.held.some((op) => op.uuid === openId.value), (gone) => {
  if (gone) frame.closeTask()
})

// A detail opened by a link (Android's Custom Tab, a reload) puts the cursor on its row once
// the row is there.
watch([openId, () => rows.value.some((x) => x.uuid === openId.value)], ([uuid, shown]) => {
  if (uuid && shown) page.select(uuid)
}, { immediate: true })

defineExpose({
  cursor: page.cursor, select: page.select, leave: page.leave, open, detailOpen: computed(() => !!openId.value), searching,
  todayOpen, toggleToday,
})
</script>

<template>
  <AppFrame
    v-bind="frame.props.value" :panel-label="openId ? t('d.title') : todayOpen && !$slots.panel ? t('shell.today') : panelLabel" searchable
    v-on="frame.on" @close-panel="close" @search-enter="toHits"
  >
    <template v-if="searching" #head>
      <EyebrowLine :parts="searchEyebrow" />
      <PageHeading :parts="t('h.search')" class="search-h" />
      <div class="actions">
        <PillButton quiet @click="endSearch">{{ t('search.end') }} <kbd aria-hidden="true">Esc</kbd></PillButton>
      </div>
    </template>
    <template v-else #head>
      <slot name="top" />
      <div class="head" :class="{ aside: $slots.aside }">
        <div class="text">
          <EyebrowLine :parts="eyebrow" />
          <PageHeading :parts="heading" :class="{ sr: headingHidden }" />
          <slot name="byline" />
        </div>
        <slot name="aside" />
      </div>
      <slot name="head" />
    </template>
    <template v-if="$slots.chips && !searching" #chips><slot name="chips" /></template>
    <slot v-if="!searching" />
    <EmptyState v-if="searching && gtd.today && !rows.length" :text="t('empty.search')" />
    <SectionList
      v-if="gtd.today" :sections="shown" :today="gtd.today" :cursor="page.cursor.value" :leaving="page.leaving"
      @check="page.check" @select="onSelect" @retry="page.retry"
    />
    <slot v-if="!searching" name="after" />
    <template #capture>
      <CaptureLine ref="captureLine" :focus-on-open="captureFocus && frame.props.value.view === 'inbox'" :key-hint="!keys.capture" />
    </template>
    <template v-if="openId" #panel>
      <TaskDetail
        :key="openId" :uuid="openId" :fallback="frame.task.value" :arrive="arrival?.uuid === openId ? arrival.how : null"
        @close="close" @arrived="arrival = null" @plan="page.plan"
        @check="finish(page.check, $event)" @delete="finish(page.remove, $event)"
      />
    </template>
    <template v-else-if="$slots.panel && !searching" #panel><slot name="panel" /></template>
    <template v-else-if="todayOpen && !searching" #panel>
      <!-- the phone's sheet is a dialog, where the page's keys rest: Esc closes Heute here (as TaskDetail) -->
      <div @keydown.esc.stop="close">
        <div class="today-head">
          <button ref="todayClose" type="button" class="mclose" @click="close"><kbd aria-hidden="true">Esc</kbd> {{ t('close') }}</button>
        </div>
        <component :is="frame.margin" :view="marginView" />
      </div>
    </template>
    <template #margin><component :is="frame.margin" :view="marginView" /></template>
    <template #notice>
      <NoticeBar v-if="notice" :key="notice.id" :text="notice.text" :undo="!!notice.undo" :ms="notice.ms" @undo="undoNotice" />
    </template>
  </AppFrame>
</template>

<style scoped>
.search-h { margin-top: 12px; }
/* 06 web.css .mhead, .mclose: Heute opened from the lens box */
.today-head { display: flex; justify-content: flex-end; margin: -8px 0 6px; }
.mclose {
  display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 2px;
  font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute);
}
.mclose:hover { color: var(--rw-text); }
.actions { display: flex; gap: 10px; margin-top: 20px; align-items: center; flex-wrap: wrap; }
.text { min-width: 0; display: grid; row-gap: 12px; }
/* a container, so the aside can make room where the column is narrow (Heute docked at 761–1180 px) */
.head.aside {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 24px; align-items: center;
  container: head / inline-size;
}
@media (max-width: 760px) {
  .text { row-gap: 8px; }
  .head.aside { column-gap: 12px; }
}
</style>
