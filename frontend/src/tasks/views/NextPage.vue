<script setup>
/**
 * Nächste (06 `renderHead('next')`, `sectionsFor('next')`): the eyebrow with the selected
 * chip's own count, "Was jetzt zählt" (screen-reader only on the phone), today's caption
 * (the lens joins it in M11), the context chips, then Fällig · Jetzt · Bald · Später. With a
 * context filter, todos due in other contexts stay visible: in their own section, or — when
 * the filtered context has nothing due — under the one Fällig heading with "andere Kontexte".
 */
import { computed } from 'vue'
import { PHONE, useMedia } from '../../composables/useMedia.js'
import { NO_CONTEXT, eyebrowCount } from '../../shared/contexts.js'
import { lensCaption } from '../../shared/dayProgress.js'
import { t } from '../../shared/i18n.js'
import ContextBar from '../components/ContextBar.vue'
import ListFrame from '../components/ListFrame.vue'
import { contextFilter } from '../listState.js'
import { useGtdStore } from '../stores/gtd.js'

const gtd = useGtdStore()
const phone = useMedia(PHONE)

const eyebrow = computed(() => [t('list.next'), ...eyebrowCount(contextFilter.value, gtd.contextCount)])
const caption = computed(() => (gtd.progress ? lensCaption(gtd.progress, { short: phone.value }) : ''))

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
const keys = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((k) => [`ctx.${k}`, () => {
    const chip = chipByKey(k)
    if (chip) select(chip.value)
  }]),
)
</script>

<template>
  <ListFrame :eyebrow="eyebrow" :heading="t('h.next')" :heading-hidden="phone" :sections="sections" :scopes="['next']" :keys="keys">
    <template #aside>
      <p v-if="caption" class="caption">{{ caption }}</p>
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
.caption {
  margin: 0; padding-top: 10px; white-space: nowrap;
  font-family: var(--rw-font-mono); font-size: 11.5px; letter-spacing: 0.02em; color: var(--rw-text);
}
@media (max-width: 760px) {
  .caption { padding-top: 0; font-size: 12px; }
}
</style>
