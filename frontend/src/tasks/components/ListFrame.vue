<script setup>
/**
 * The frame every list page shares: AppFrame with the page's eyebrow, heading and chips, the
 * sections, the notice, and the row behaviour of `useListPage` (cursor, tick off, delete, plan,
 * keys), and the capture line (`n` focuses it). A page only says what its head shows and which
 * sections it has. Slots: `aside` (right of the heading: Nächste's caption), `head` (under it),
 * `chips`, default (above the list).
 */
import { computed, ref } from 'vue'
import AppFrame from '../../layout/AppFrame.vue'
import NoticeBar from '../../layout/NoticeBar.vue'
import EyebrowLine from '../../layout/ui/EyebrowLine.vue'
import PageHeading from '../../layout/ui/PageHeading.vue'
import { useFrame } from '../../composables/useFrame.js'
import { notice, undoNotice } from '../notice.js'
import { useGtdStore } from '../stores/gtd.js'
import { useListPage } from '../useListPage.js'
import CaptureLine from './CaptureLine.vue'
import SectionList from './SectionList.vue'

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
const page = useListPage({
  rows,
  scopes: () => ['rows', ...props.scopes],
  keys: { capture: () => captureLine.value?.focus(), ...props.keys },
  plannable: props.plannable,
})
</script>

<template>
  <AppFrame v-bind="frame.props.value" v-on="frame.on">
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
      @check="page.check" @select="page.select" @retry="page.retry"
    />
    <template #capture>
      <CaptureLine ref="captureLine" :focus-on-open="frame.props.value.view === 'inbox'" />
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
