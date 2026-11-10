<script setup>
/**
 * The margin column ("Randspalte") beside the page on wide screens (06). A container only: its
 * panels (Heute, Nachhaken, Projekte, Rückblick, the detail, the clarify panel) come with their
 * milestones and are passed in through the frame's `margin` slot.
 */
import { t } from '../shared/i18n.js'
</script>

<template>
  <aside class="margin" :aria-label="t('shell.margin')">
    <slot />
  </aside>
</template>

<style scoped>
.margin { min-height: 0; overflow: auto; padding: 30px 30px 40px; border-left: 1px solid var(--rw-rule); background: var(--rw-bg); }
</style>
