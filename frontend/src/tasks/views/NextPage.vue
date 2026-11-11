<script setup>
/**
 * Nächste (06 `renderHead('next')`, `sectionsFor('next')`): the eyebrow with the selected
 * chip's own count, "Was jetzt zählt" (screen-reader only on the phone), the Tageslinse with
 * today's caption beside it (plan M11: 104 px, 52 px flat on the phone; the caption is the full
 * `3 von 7 heute · 1 zusätzlich` everywhere, its second part wrapping to a line of its own where
 * it does not fit; on the phone it sits under the eyebrow, left of the lens, so the eyebrow keeps
 * its one line), the context chips, then Fällig · Jetzt · Bald · Später. With a
 * context filter, todos due in other contexts stay visible: in their own section, or — when
 * the filtered context has nothing due — under the one Fällig heading with "andere Kontexte".
 * The lens box is a button (plan M12, 06 `data-act="today"`): it opens the margin's panels as
 * the page's panel — useful where no margin column shows them (761–1180 px, the phone); closing
 * Heute brings the focus back to the box (any other `Esc` leaves it where it is). Where the head is
 * narrow (Heute docked), the caption sits under the lens.
 */
import { computed, ref, watch } from 'vue'
import LensSlot from '../../layout/lens/LensSlot.vue'
import { landings, useShownProgress } from '../../layout/lens/useBeadFlight.js'
import { PHONE, useMedia } from '../../composables/useMedia.js'
import { NO_CONTEXT, eyebrowCount } from '../../shared/contexts.js'
import { lensCaptionParts } from '../../shared/dayProgress.js'
import { t } from '../../shared/i18n.js'
import ContextBar from '../components/ContextBar.vue'
import ListFrame from '../components/ListFrame.vue'
import { contextFilter } from '../listState.js'
import { useGtdStore } from '../stores/gtd.js'

const gtd = useGtdStore()
const phone = useMedia(PHONE)

const eyebrow = computed(() => [t('list.next'), ...eyebrowCount(contextFilter.value, gtd.contextCount)])
/** What the lens and caption show: the store's progress, held while a bead flies. */
const shown = useShownProgress(() => gtd.progress)
const caption = computed(() => (shown.value ? lensCaptionParts(shown.value) : null))
/** The caption rolls in once when a bead has landed (06 `.lens-cap.roll`). */
const roll = ref(0)
watch(landings, () => {
  roll.value += 1
})

const sections = computed(() => {
  if (!gtd.today) return []
  const ctx = contextFilter.value
  const s = gtd.sectionsFor(ctx)
  const due = s.dueMerged
    ? [{ key: 'due', label: t('sec.due'), note: t('sec.otherCtx'), strong: true, kind: 'next', tasks: s.faelligAndere }]
    : [
        { key: 'due', label: t('sec.due'), strong: true, empty: t('empty.due'), kind: 'next', tasks: s.faellig },
        { key: 'dueOther', label: t('sec.dueOther'), kind: 'next', tasks: s.faelligAndere },
      ]
  const none = !s.jetzt.length && !s.bald.length && !s.spaeter.length
  const emptyNext = ctx ? t('empty.nextCtx', { ctx: ctx === NO_CONTEXT ? t('ctx.none') : ctx }) : t('empty.next')
  return [
    ...due,
    { key: 'jetzt', label: t('sec.jetzt'), strong: true, kind: 'next', tasks: s.jetzt },
    { key: 'bald', label: t('sec.bald'), kind: 'next', tasks: s.bald },
    { key: 'spaeter', label: t('sec.spaeter'), kind: 'next', tasks: s.spaeter, empty: none ? emptyNext : null },
  ].filter((x) => x.tasks.length || x.empty)
})

const frame = ref(null)
const lensButton = ref(null)
const todayOpen = computed(() => !!frame.value?.todayOpen)
/** Heute closed (`Esc`, "schließen", the scrim): the focus back on the lens box; any other `Esc` leaves it. */
function closedPanel({ today } = {}) {
  if (today) lensButton.value?.focus()
}

const select = (ctx) => {
  contextFilter.value = ctx
}

/** A chip by key: 0 Alle, 1–5 the first five contexts, 6 ohne Kontext (only where those chips exist). */
function chipByKey(k) {
  if (k === 0) return { value: null }
  if (k === 6) return gtd.contextCount.none > 0 ? { value: NO_CONTEXT } : null
  const c = gtd.contexts[k - 1]
  return c ? { value: c } : null
}
/** The palette offers the chips by name; Kontextfilter aufheben only while one is set. */
const offers = () => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((k) => {
  const chip = chipByKey(k)
  if (!chip) return [`ctx.${k}`, false]
  if (k === 0) return ['ctx.0', contextFilter.value != null]
  return [`ctx.${k}`, { c: k === 6 ? t('ctx.none') : chip.value }]
}))
const keys = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((k) => [`ctx.${k}`, () => {
    const chip = chipByKey(k)
    if (chip) select(chip.value)
  }]),
)
</script>

<template>
  <ListFrame
    ref="frame" :eyebrow="eyebrow" :heading="t('h.next')" :heading-hidden="phone" :sections="sections" :scopes="['next']"
    :keys="keys" :offers="offers" @close-panel="closedPanel"
  >
    <template v-if="phone && caption" #byline>
      <p :key="roll" class="caption" :class="{ roll: roll > 0 }">
        <span>{{ caption[0] }}</span><template v-if="caption[1]">{{ ' ' }}<span>{{ caption[1].trim() }}</span></template>
      </p>
    </template>
    <template #aside>
      <button
        v-if="caption" ref="lensButton" type="button" class="lensbox" :aria-expanded="todayOpen"
        @click="frame?.toggleToday()"
      >
        <span v-if="!phone" :key="roll" class="caption" :class="{ roll: roll > 0 }">
          <span>{{ caption[0] }}</span><template v-if="caption[1]">{{ ' ' }}<span>{{ caption[1].trim() }}</span></template>
        </span>
        <span class="sr">{{ phone ? t('lens.open') : `. ${t('lens.open')}` }}</span>
        <LensSlot :size="phone ? 52 : 104" :level="shown.level" />
      </button>
    </template>
    <template #chips>
      <ContextBar
        :contexts="gtd.contexts" :counts="gtd.contextCount" :selected="contextFilter"
        @select="select"
      />
    </template>
  </ListFrame>
</template>

<style scoped>
.lensbox {
  display: grid; grid-template-columns: auto auto; align-items: center; column-gap: 14px; margin: -2px -6px -4px 0;
  padding: 0; border-radius: var(--rw-radius-md); text-align: inherit; color: inherit;
}
.lensbox .caption { display: block; }
.caption {
  margin: 0; padding-top: 10px; text-align: right;
  font-family: var(--rw-font-mono); font-size: 11.5px; letter-spacing: 0.02em; color: var(--rw-text);
}
/* the two parts never break inside; the second wraps to its own line only where it does not fit */
.caption span { white-space: nowrap; }
.caption.roll { animation: rw-roll 420ms var(--rw-ease); }
@keyframes rw-roll { from { transform: translateY(60%); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .caption.roll { animation: none; } }
/* a narrow head (Heute docked beside Nächste at 761–1180 px): the caption goes under the lens, so the
   eyebrow and "Was jetzt zählt" keep their lines */
@container head (max-width: 560px) {
  .lensbox { grid-template-columns: auto; justify-items: center; row-gap: 4px; }
  .lensbox .caption { order: 2; padding-top: 0; max-width: 120px; text-align: center; }
}
@media (max-width: 760px) {
  .lensbox { margin: -4px -4px -4px 0; }
  .caption { padding-top: 0; font-size: 12px; text-align: left; }
}
</style>
