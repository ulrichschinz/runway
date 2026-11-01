<script setup>
/**
 * Inbox, list mode (06 `renderHead('inbox')`): what came in, newest first, with notes and
 * when it was captured. Empty: "Inbox ist leer." and the way to Nächste. Clarifying (M8) and
 * the stack (M10) come later; ticking off and deleting work here as everywhere.
 */
import { computed } from 'vue'
import { t } from '../../shared/i18n.js'
import { entryInfo } from '../../shared/rowMeta.js'
import ListFrame from '../components/ListFrame.vue'
import { useGtdStore } from '../stores/gtd.js'

const gtd = useGtdStore()

const empty = computed(() => gtd.loaded && gtd.inbox.length === 0)
const eyebrow = computed(() => {
  if (!gtd.today) return [t('list.inbox')]
  if (empty.value) return [t('list.inbox'), '0', t('stand', { t: gtd.stand })]
  const oldest = gtd.inbox[gtd.inbox.length - 1]
  return [t('list.inbox'), t('inbox.open', { n: gtd.inbox.length }), t('inbox.oldest', { d: entryInfo(oldest, gtd.today) })]
})
const sections = computed(() => (gtd.today && !empty.value ? [{ key: 'inbox', kind: 'inbox', tasks: gtd.inbox }] : []))
</script>

<template>
  <ListFrame :eyebrow="eyebrow" :heading="t(empty ? 'h.inboxEmpty' : 'h.inbox')" :sections="sections" :plannable="false">
    <template v-if="empty">
      <p class="lead">{{ t('inbox.zeroLead') }}</p>
      <RouterLink to="/next" class="pill">{{ t('inbox.toNext') }}</RouterLink>
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
