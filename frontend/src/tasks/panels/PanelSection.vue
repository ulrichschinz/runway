<script setup>
/**
 * One section of the margin column (06 `.msec`): its eyebrow, then what the panel shows. The one
 * place the four panels take their eyebrow from (plan M12, brief 0059).
 */
import EyebrowLine from '../../layout/ui/EyebrowLine.vue'

defineProps({
  /** the eyebrow's parts after the `//` */
  eyebrow: { type: Array, required: true },
})
</script>

<template>
  <section class="msec">
    <EyebrowLine :parts="eyebrow" class="mhead" />
    <slot />
  </section>
</template>

<style scoped>
.msec + .msec { margin-top: 30px; }
.mhead { margin-bottom: 10px; }
/* 06 web.css: the margin's rows and notes */
.msec :deep(.mrow) {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: baseline; width: 100%; min-height: 44px;
  padding: 8px 0; border-bottom: 1px solid var(--rw-rule); font-size: 13.5px; text-align: left; color: var(--rw-text);
  text-decoration: none;
}
.msec :deep(.mrow:focus-visible) { outline-offset: -2px; }
.msec :deep(.mrow .t) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msec :deep(.mrow .m) { font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); white-space: nowrap; }
.msec :deep(.mnote) { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--rw-mute); }
.msec :deep(.mnote b) { color: var(--rw-text); font-weight: 500; }
.msec :deep(.ring-mark) {
  display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; vertical-align: -0.5px;
  box-shadow: inset 0 0 0 1.5px var(--rw-marker);
}
</style>
