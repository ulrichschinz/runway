<script setup>
/**
 * The frame every list page shares: AppFrame with the page's eyebrow, heading and chips, the
 * sections, the notice, and the row behaviour of `useListPage` (cursor, tick off, delete, plan,
 * keys), the capture line (`n` focuses it) and the open todo's detail (`?task=<uuid>`, plan M7:
 * a click on a row, `Enter`/`o`, `e` to edit its text; `Esc` closes it and the focus goes back to
 * the row). A page only says what its head shows and which sections it has. Slots: `aside`
 * (right of the heading: Nächste's caption), `head` (under it), `chips`, default (above the list).
 */
import { computed, ref, watch } from 'vue'
import AppFrame from '../../layout/AppFrame.vue'
import NoticeBar from '../../layout/NoticeBar.vue'
import EyebrowLine from '../../layout/ui/EyebrowLine.vue'
import PageHeading from '../../layout/ui/PageHeading.vue'
import { useFrame } from '../../composables/useFrame.js'
import { t } from '../../shared/i18n.js'
import { notice, undoNotice } from '../notice.js'
import { useGtdStore } from '../stores/gtd.js'
import { useListPage } from '../useListPage.js'
import CaptureLine from './CaptureLine.vue'
import SectionList from './SectionList.vue'
import TaskDetail from './TaskDetail.vue'

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
  plannable: { type: Boolean, default: true },
})

const frame = useFrame()
const gtd = useGtdStore()
const rows = computed(() => props.sections.filter((s) => s.kind !== 'done').flatMap((s) => s.tasks))
const captureLine = ref(null)
/** The todo whose detail is open, from the address. */
const openId = frame.taskId
/**
 * How the person opened the detail, for TaskDetail to act on once it shows the todo: `focus`
 * (a click, `Enter`), `edit` (`e`). A link or the cursor (`j` `k`) moves nothing.
 */
const arrival = ref(null)

function open(uuid, { edit = false } = {}) {
  page.select(uuid)
  arrival.value = { uuid, how: edit ? 'edit' : 'focus' }
  if (openId.value !== uuid) frame.openTask(uuid)
}

function close() {
  const uuid = openId.value
  if (!uuid) return
  frame.closeTask()
  page.focusRow(uuid)
}

/** A row was clicked: an open todo opens its detail, a done one (Alle) only takes the cursor. */
function onSelect(uuid) {
  if (rows.value.some((x) => x.uuid === uuid)) open(uuid)
  else page.select(uuid)
}

/** Abhaken or Löschen in the detail: the list page's own action and notice; the focus goes to the next row. */
function finish(action, uuid) {
  action(uuid)
  page.focusRow(page.cursor.value)
}

const page = useListPage({
  rows,
  scopes: () => ['rows', ...props.scopes],
  keys: { capture: () => captureLine.value?.focus(), close, ...props.keys },
  plannable: props.plannable,
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
</script>

<template>
  <AppFrame v-bind="frame.props.value" :panel-label="t('d.title')" v-on="frame.on" @close-panel="close">
    <template #head>
      <div class="head" :class="{ aside: $slots.aside }">
        <div class="text">
          <EyebrowLine :parts="eyebrow" />
          <PageHeading :parts="heading" :class="{ sr: headingHidden }" />
        </div>
        <slot name="aside" />
      </div>
      <slot name="head" />
    </template>
    <template v-if="$slots.chips" #chips><slot name="chips" /></template>
    <slot />
    <SectionList
      v-if="gtd.today" :sections="sections" :today="gtd.today" :cursor="page.cursor.value" :leaving="page.leaving"
      @check="page.check" @select="onSelect" @retry="page.retry"
    />
    <template #capture>
      <CaptureLine ref="captureLine" :focus-on-open="frame.props.value.view === 'inbox'" />
    </template>
    <template v-if="openId" #panel>
      <TaskDetail
        :key="openId" :uuid="openId" :fallback="frame.task.value" :arrive="arrival?.uuid === openId ? arrival.how : null"
        @close="close" @arrived="arrival = null" @plan="page.plan"
        @check="finish(page.check, $event)" @delete="finish(page.remove, $event)"
      />
    </template>
    <template #notice>
      <NoticeBar v-if="notice" :key="notice.id" :text="notice.text" :undo="!!notice.undo" :ms="notice.ms" @undo="undoNotice" />
    </template>
  </AppFrame>
</template>

<style scoped>
.text { min-width: 0; display: grid; row-gap: 12px; }
.head.aside { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 24px; align-items: center; }
@media (max-width: 760px) {
  .text { row-gap: 8px; }
  .head.aside { column-gap: 12px; }
}
</style>
