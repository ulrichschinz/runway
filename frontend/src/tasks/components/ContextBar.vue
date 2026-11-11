<script setup>
/**
 * The context chips of Nächste (06 `.ctxbar`, plan D1): `Alle`, the present contexts in the
 * shared order, `ohne Kontext` dashed when there are todos without one. Counts come from
 * `contextCounts` through `chipCount`, the same function the eyebrow uses. The chips wrap,
 * never scroll. Keys: 0 Alle, 1–5 the first five contexts, 6 ohne Kontext.
 */
import { computed } from 'vue'
import { NO_CONTEXT, chipCount } from '../../shared/contexts.js'
import { t } from '../../shared/i18n.js'

const props = defineProps({
  /** the ordered contexts (`orderContexts`) */
  contexts: { type: Array, required: true },
  /** `contextCounts` */
  counts: { type: Object, required: true },
  /** null (Alle), `'@x'` or `NO_CONTEXT` */
  selected: { type: String, default: null },
})
defineEmits(['select'])

const chips = computed(() => [
  { value: null, label: t('ctx.all'), key: '0' },
  ...props.contexts.map((c, i) => ({ value: c, label: c, key: i < 5 ? String(i + 1) : null })),
  ...(props.counts.none > 0 ? [{ value: NO_CONTEXT, label: t('ctx.none'), key: '6', dashed: true }] : []),
])
</script>

<template>
  <div class="ctxbar" role="group" :aria-label="t('ctx.label')">
    <button
      v-for="chip in chips" :key="chip.value ?? ''" type="button" class="ctx" :class="{ dashed: chip.dashed }"
      :aria-pressed="selected === chip.value" :title="chip.key ? t('key.n', { k: chip.key }) : undefined"
      @click="$emit('select', chip.value)"
    >
      <span class="pill">{{ chip.label }} <span class="n">{{ chipCount(chip.value, counts) }}</span></span>
    </button>
  </div>
</template>

<style scoped>
.ctxbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ctx { display: inline-flex; align-items: center; border-radius: var(--rw-radius-pill); }
.pill {
  display: inline-flex; align-items: center; gap: 7px; min-height: 30px; padding: 0 12px;
  border: 1px solid var(--rw-rule); border-radius: var(--rw-radius-pill);
  font-family: var(--rw-font-mono); font-size: 11.5px; letter-spacing: 0.02em; color: var(--rw-mute); white-space: nowrap;
  transition: background var(--rw-dur-fast), color var(--rw-dur-fast), border-color var(--rw-dur-fast);
}
.ctx:hover .pill { color: var(--rw-text); border-color: var(--rw-rule-strong); }
.n { color: var(--rw-mute); }
.dashed .pill { border-style: dashed; border-color: var(--rw-rule-strong); }
.ctx[aria-pressed='true'] .pill { background: var(--rw-inverse); color: var(--rw-on-inverse); border: 1px solid var(--rw-inverse); }
.ctx[aria-pressed='true'] .n { color: color-mix(in srgb, var(--rw-on-inverse) 60%, transparent); }
/* the phone dock: the visible pill stays 32 px, the button around it is the dock's 48 px touch target (plan §5) */
@media (max-width: 760px) {
  .ctxbar { column-gap: 6px; row-gap: 0; }
  .ctx { min-height: 48px; }
  .pill { min-height: 32px; padding: 0 11px; }
}
</style>
