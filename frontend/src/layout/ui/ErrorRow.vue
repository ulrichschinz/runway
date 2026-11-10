<script setup>
/** A write the server did not take, on its own row: "Nicht gesendet · Erneut senden" (02, plan §6.4). */
import { t } from '../../shared/i18n.js'

defineEmits(['retry'])
</script>

<template>
  <span class="unsent">
    <span>{{ t('sync.unsent') }}</span>
    <button type="button" @click.stop="$emit('retry')">{{ t('sync.retry') }}</button>
  </span>
</template>

<style scoped>
.unsent {
  display: inline-flex; align-items: center; gap: 8px; flex: none; white-space: nowrap;
  font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-overdue);
}
button { color: var(--rw-text); border-bottom: 1px solid var(--rw-overdue-mark); line-height: 1.2; min-height: 24px; }
</style>
