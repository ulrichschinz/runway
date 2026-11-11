<script setup>
/**
 * The margin column ("Randspalte") beside the page on wide screens (06). A container only: the
 * frame puts into it the page's `margin` slot — the panels Heute, Nachhaken, Projekte, Rückblick
 * (`tasks/panels/MarginPanels.vue`, plan M12) — or, while one is open, the `panel` slot (a todo's
 * detail, the Inbox's clarify panel, Nächste's Heute).
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
