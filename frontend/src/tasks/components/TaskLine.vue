<script setup>
/**
 * One todo in a list (06 `rowHTML`, plan M5): a leading 44 px ring (`Abhaken: <d>`), a one-line
 * title, then mono meta — fixed columns on wide screens, one non-wrapping line on the phone.
 * Overdue: the coral edge rule and the word "überfällig". Running: "läuft" with the coral pulse.
 * A write the server did not take: "Nicht gesendet · Erneut senden". Swipe right completes, on
 * touch only. The accessible name is Android's row text.
 *
 * How it leaves (strike, collapse) is the list's leave transition (`SectionList.vue`); the
 * classes it sets are styled here.
 */
import { computed } from 'vue'
import ErrorRow from '../../layout/ui/ErrorRow.vue'
import { t } from '../../shared/i18n.js'
import { dueInfo, metaOf, rowLabel } from '../../shared/rowMeta.js'
import { useSwipe } from '../useSwipe.js'
import InkStrike from './InkStrike.vue'

const props = defineProps({
  task: { type: Object, required: true },
  /** whose columns: 'inbox' | 'next' | 'waiting' | 'someday' | 'done' */
  kind: { type: String, required: true },
  today: { type: String, required: true },
  /** the keyboard cursor is on this row */
  cursor: { type: Boolean, default: false },
})
const emit = defineEmits(['check', 'select', 'retry'])

const done = computed(() => props.kind === 'done')
const meta = computed(() => metaOf(props.task, props.kind, props.today))
const overdue = computed(() => !done.value && dueInfo(props.task, props.today)?.tone === 'overdue')
const failed = computed(() => props.task.sync === 'failed')
const notes = computed(() => props.task.annotations?.length || 0)
const label = computed(() => (done.value ? props.task.description : rowLabel(props.task, props.today)))

const swipe = useSwipe(() => emit('check'))
const shift = computed(() => (swipe.offset.value ? { transform: `translateX(${swipe.offset.value}px)` } : null))
</script>

<template>
  <div
    class="line" :class="[`k-${kind}`, { overdue, cursor, failed, done, swiping: swipe.dragging.value }]"
    role="group" :aria-label="label" :aria-current="cursor || undefined" tabindex="-1" :data-row="task.uuid"
    :style="shift" v-on="done ? {} : swipe.handlers" @click="$emit('select')"
  >
    <span v-if="done" class="tick" aria-hidden="true" />
    <button v-else type="button" class="tick" :aria-label="t('row.check', { d: task.description })" @click.stop="$emit('check')" />
    <div class="main">
      <span class="desc"><span class="txt">{{ task.description }}</span><InkStrike :seed="task.uuid" /></span>
      <span v-if="task.start && !done" class="live"><i class="pulse" aria-hidden="true" />{{ t('row.running') }}</span>
      <span v-if="task.priority === 'H' && !done" class="prio" :title="t('row.prioH')">H</span>
      <span v-if="kind !== 'inbox' && notes" class="note" :title="t('row.notesTitle')">¶ {{ notes }}</span>
      <ErrorRow v-if="failed" @retry="$emit('retry', task.opId)" />
    </div>
    <span class="meta">
      <span v-for="(m, i) in meta" :key="i" class="m" :class="[m.tone, { blank: !m.text }]"><span v-if="m.ring" class="ring-mark" aria-hidden="true" />{{ m.text }}</span>
    </span>
  </div>
</template>

<style scoped>
.line {
  position: relative; display: grid; align-items: center; column-gap: 14px;
  grid-template-columns: 44px minmax(0, 1fr) 132px 98px 126px; min-height: 44px; padding: 0 4px 0 0;
  border-bottom: 1px solid var(--rw-rule); outline: none; touch-action: pan-y;
  transition: background var(--rw-dur-fast), transform var(--rw-dur-base) var(--rw-ease);
}
.line.k-inbox, .line.k-waiting, .line.k-someday { grid-template-columns: 44px minmax(0, 1fr) 136px 208px; }
.line:hover { background: var(--rw-hover); }
.meta { display: contents; }
.m:last-child { text-align: right; }

/* the tick ring: a 44 px target around the 18 px circle */
.tick { width: 44px; height: 44px; margin: 0 -8px; display: grid; place-items: center; border-radius: 50%; }
.tick::before {
  content: ''; width: var(--rw-size-ring-web); height: var(--rw-size-ring-web); border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px var(--rw-mute);
  transition: box-shadow var(--rw-dur-fast), background var(--rw-dur-base) var(--rw-ease), transform var(--rw-dur-base) var(--rw-ease);
}
button.tick:hover::before { box-shadow: inset 0 0 0 1.5px var(--rw-text); }
.overdue .tick::before { box-shadow: inset 0 0 0 1.5px var(--rw-overdue); }

.main { min-width: 0; display: flex; align-items: center; gap: 10px; }
.desc { position: relative; display: inline-block; max-width: 100%; min-width: 0; }
.txt { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color var(--rw-dur-slow); }
.live { display: inline-flex; align-items: center; gap: 6px; flex: none; font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--rw-action); animation: rw-pulse 2s ease-in-out infinite; }
@keyframes rw-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.45); opacity: 0.55; } }
.prio { flex: none; font-family: var(--rw-font-mono); font-size: 10.5px; color: var(--rw-accent); }
.note { flex: none; font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }

.m {
  font-family: var(--rw-font-mono); font-size: var(--rw-type-meta-size); letter-spacing: var(--rw-type-meta-tracking);
  color: var(--rw-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.m.overdue { color: var(--rw-overdue); }
.m.today, .m.follow, .m.planned { color: var(--rw-text); }
.m.planned::before {
  content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 7px; border-radius: 50%;
  background: var(--rw-action); vertical-align: 0.5px;
}
.ring-mark {
  display: inline-block; width: 8px; height: 8px; margin-right: 7px; border-radius: 50%; vertical-align: -0.5px;
  box-shadow: inset 0 0 0 1.5px var(--rw-marker);
}

/* edges: overdue, or a write that was not sent — a 2 px coral rule, never colour alone */
.overdue::after, .failed::after {
  content: ''; position: absolute; left: -1px; top: 8px; bottom: 8px; width: 2px; border-radius: 2px; background: var(--rw-overdue-mark);
}
/* the keyboard cursor: tint plus a 2 px plum rule and the yellow dot in the gutter */
.cursor { background: var(--rw-focus); box-shadow: inset 2px 0 0 var(--rw-accent); }
.cursor::before {
  content: ''; position: absolute; left: -18px; top: 50%; width: 6px; height: 6px; margin-top: -3px;
  border-radius: 50%; background: var(--rw-marker);
}
@media (hover: none) and (pointer: coarse) {
  .cursor { background: transparent; box-shadow: none; }
  .cursor::before { display: none; }
}

/* ticked off, deleted, done: the ink strike */
.is-struck :deep(.strike path), .done :deep(.strike path) { opacity: 1; stroke-dashoffset: 0; }
.is-struck :deep(.strike path) { transition: stroke-dashoffset 160ms var(--rw-ease); }
.is-struck .txt, .done .txt { color: var(--rw-mute); }
.is-struck .tick::before, .done .tick::before { background: var(--rw-action); box-shadow: inset 0 0 0 1.5px var(--rw-action); transform: scale(0.82); }
.is-deleted :deep(.strike path) { opacity: 1; stroke: var(--rw-soft); stroke-dashoffset: 0; transition: stroke-dashoffset 160ms var(--rw-ease); }
.is-deleted .txt { color: var(--rw-soft); }
/* filed or moved to another list: no strike, the text fades (06 .row.is-filed) */
.is-filed .txt { color: var(--rw-soft); }
.line.is-gone {
  overflow: hidden; height: 0 !important; min-height: 0; opacity: 0; border-bottom-color: transparent;
  transition: height 120ms var(--rw-ease), min-height 120ms var(--rw-ease), opacity 120ms;
}
.line.swiping { background: var(--rw-hover); transition: none; }

/* a narrow page column on a wide screen (the detail docked beside it, 06 `.app.dock`): the title
   keeps its room, only the last meta column (the day) stays */
@media (min-width: 761px) {
  @container page (max-width: 600px) {
    .line, .line.k-inbox, .line.k-waiting, .line.k-someday { grid-template-columns: 44px minmax(0, 1fr) 156px; }
    .m:not(:last-child) { display: none; }
  }
}

/* the phone: ring, then the title over one meta line; at most 60 px */
@media (max-width: 760px) {
  .line, .line.k-inbox, .line.k-waiting, .line.k-someday {
    grid-template-columns: 44px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 8px; row-gap: 1px;
    min-height: 56px; padding: 7px 0 6px;
  }
  .tick { grid-row: 1 / span 2; margin: 0 0 0 -8px; }
  .main { grid-column: 2; }
  .txt { font-size: 16px; line-height: 1.3; }
  .meta { display: flex; grid-column: 2; gap: 10px; overflow: hidden; line-height: 1.5; }
  .m { flex: none; }
  .m:last-child { flex: 0 1 auto; min-width: 0; text-align: left; }
  .m.blank { display: none; }
  .overdue::after, .failed::after { left: -10px; }
}
</style>
