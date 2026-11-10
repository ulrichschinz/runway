<script setup>
/**
 * The rail on wide screens (06 `renderRail`): lockup, the lists with their counts, the places below,
 * the outbox line and the footer with the user and "Stand". The current entry carries a yellow dot;
 * a yellow ring means "needs a look" and always comes with a word (`fällig`) or a title, never
 * alone. Everything it shows comes in as props (brief 0050). The foot opens the command palette
 * and the `?` sheet (06 `.rail-foot`).
 */
import { computed } from 'vue'
import BrandMark from '../components/BrandMark.vue'
import { paletteKeyHint } from '../composables/useCommands.js'
import { LISTS, PLACES, navKeyOf } from '../shared/navigation.js'
import { t } from '../shared/i18n.js'

const props = defineProps({
  view: { type: String, default: null },
  counts: { type: Object, required: true },
  flags: { type: Object, required: true },
  stand: { type: String, default: '' },
  offline: { type: Boolean, default: false },
  failedCount: { type: Number, default: 0 },
  user: { type: String, default: '' },
})
defineEmits(['retry', 'palette', 'shortcuts'])

const current = computed(() => navKeyOf(props.view))
const unsent = computed(() => t('sync.n', { n: props.failedCount }))
</script>

<template>
  <aside class="rail">
    <RouterLink to="/next" class="brand" :aria-label="`${t('brand.name')} ${t('brand.product')}`">
      <BrandMark :size="32" />
      <span>{{ t('brand.name') }}</span>
    </RouterLink>
    <div class="product"><span class="slash" aria-hidden="true">//</span> {{ t('brand.product') }}</div>

    <nav class="nav" :aria-label="t('nav.lists')">
      <RouterLink
        v-for="item in LISTS" :key="item.key" :to="item.to"
        :aria-current="current === item.key ? 'page' : undefined"
      >
        <span class="slot" aria-hidden="true" />
        <span>{{ t(item.label) }}</span>
        <span class="count" :class="{ hot: item.key === 'inbox' && counts.inbox }">
          <span v-if="item.key === 'projects' && flags.stalled" class="ring-mark" :title="t('proj.stalled')" />
          <span v-if="item.key === 'projects' && flags.stalled" class="sr">{{ t('proj.stalled') }}</span>
          {{ counts[item.key] ?? '' }}
          <template v-if="item.key === 'inbox' && flags.inboxDot">
            <span class="dot" aria-hidden="true" /><span class="sr">{{ t('nav.captured') }}</span>
          </template>
        </span>
      </RouterLink>
      <div class="gap" aria-hidden="true" />
      <RouterLink
        v-for="item in PLACES" :key="item.key" :to="item.to"
        :aria-current="current === item.key ? 'page' : undefined"
      >
        <span class="slot" aria-hidden="true" />
        <span>{{ t(item.label) }}</span>
        <span class="count">
          <template v-if="item.key === 'review' && flags.reviewDue">
            <span class="ring-mark" aria-hidden="true" />{{ t('nav.due') }}
          </template>
        </span>
      </RouterLink>
    </nav>

    <div class="foot">
      <button v-if="failedCount" type="button" class="unsent" :title="t('sync.retry')" @click="$emit('retry')">
        {{ unsent }} · {{ t('sync.retryShort') }}
      </button>
      <span>
        {{ user }}<template v-if="user && stand"> · </template>{{ stand ? t('stand', { t: stand }) : '' }}
        <span v-if="offline" class="offline">{{ t('shell.offline') }}</span>
      </span>
      <button type="button" class="key" @click="$emit('palette')">
        <kbd aria-hidden="true">{{ paletteKeyHint }}</kbd> {{ t('pal.title') }}
      </button>
      <button type="button" class="key" @click="$emit('shortcuts')"><kbd aria-hidden="true">?</kbd> {{ t('keys.title') }}</button>
    </div>
  </aside>
</template>

<style scoped>
.rail {
  display: flex; flex-direction: column; min-height: 0; overflow: auto;
  padding: 26px 16px 18px 22px; border-right: 1px solid var(--rw-rule);
}
.brand {
  display: inline-flex; align-items: center; gap: 10px; align-self: flex-start;
  font-weight: 500; font-size: 16px; line-height: 1; letter-spacing: var(--ar-tracking-snug); color: var(--rw-text);
}
.product { margin: 7px 0 30px 42px; font-family: var(--rw-font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--rw-mute); }
.slash { color: var(--rw-action); }
.nav { display: grid; gap: 1px; }
.nav a {
  display: grid; grid-template-columns: 14px 1fr auto; align-items: center; min-height: 34px; padding-right: 6px;
  color: var(--rw-mute); font-size: 14.5px; border-radius: var(--rw-radius-sm);
  transition: color var(--rw-dur-fast), background var(--rw-dur-fast);
}
.nav a:hover { color: var(--rw-text); background: var(--rw-hover); }
.nav a[aria-current='page'] { color: var(--rw-text); font-weight: 500; }
.slot { display: grid; place-items: center; }
.nav a[aria-current='page'] .slot::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rw-marker); }
.count {
  display: inline-flex; align-items: center; gap: 7px;
  font-family: var(--rw-font-mono); font-size: 11.5px; font-weight: 400; color: var(--rw-mute);
}
.count.hot { color: var(--rw-text); }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--rw-marker); flex: none; }
.ring-mark { width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--rw-marker); flex: none; }
.gap { height: 22px; }
.foot {
  margin-top: auto; padding-top: 18px; display: grid; gap: 10px;
  font-family: var(--rw-font-mono); font-size: 11px; letter-spacing: 0.02em; color: var(--rw-mute);
}
.key { justify-self: start; display: inline-flex; align-items: center; gap: 8px; min-height: 24px; color: var(--rw-mute); }
.key:hover { color: var(--rw-text); }
.unsent { justify-self: start; min-height: 32px; color: var(--rw-overdue); text-align: left; }
.unsent:hover { color: var(--rw-text); }
.offline {
  display: inline-block; margin-left: 6px; padding: 1px 8px; border: 1px solid var(--rw-rule-strong);
  border-radius: var(--rw-radius-pill); color: var(--rw-text);
}
</style>
