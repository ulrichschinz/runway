<script setup>
/**
 * "Claude verbinden" and "MCP-Server" in Einstellungen (plan M14, brief 0061; the old
 * `SettingsView.vue` cards of the same name, 06 `renderSettings`). The four steps are
 * `connectClaudeSteps` and the three tabs `mcpSnippets`, unchanged: what "Kopieren" puts on the
 * clipboard is byte for byte what the old page copies. Only the step titles are German, by the
 * step's `id`. Every text that holds the key is shown masked until the API-Key row's "Anzeigen"
 * (`shownText`); the old page showed the Claude Desktop and curl snippets with the key in plain.
 */
import { computed, nextTick, ref } from 'vue'
import { PLUGIN_UPDATE, RUNWAY_PROJECT_LINE, connectClaudeSteps, skillZipUrl } from '../shared/claudeConnect.js'
import { t } from '../shared/i18n.js'
import { mcpSnippets, mcpUrl } from '../shared/mcpSnippets.js'
import { shownText } from '../shared/settingsRules.js'
import CodeBlock from './CodeBlock.vue'
import SettingsSection from './SettingsSection.vue'

const props = defineProps({
  apiKey: { type: String, default: null },
  revealed: { type: Boolean, default: false },
})

const origin = window.location.origin
const shown = (text) => shownText(text, props.apiKey, props.revealed)

const steps = computed(() => connectClaudeSteps(origin, props.apiKey))
const skillZip = skillZipUrl(origin)
const pluginUpdate = PLUGIN_UPDATE.split('\n').join(' && ')
const [zipBefore, zipLink, zipAfter] = t('set.skillZip')
const [refBefore, refFile, refAfter] = t('set.setupRef')

// ── the MCP tabs ────────────────────────────────────────────────────────────────────
const TABS = ['Claude Code', 'Claude Desktop', 'curl']
const tab = ref(TABS[0])
const snippets = computed(() => mcpSnippets(origin, props.apiKey))
const endpoint = mcpUrl(origin)
const tabIds = { 'Claude Code': 'mcp-tab-code', 'Claude Desktop': 'mcp-tab-desktop', curl: 'mcp-tab-curl' }

/** The tab list's own keys (ARIA tabs): ← → move and select, Home and End jump. */
async function onTabKey(event) {
  const i = TABS.indexOf(tab.value)
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[event.key]
  if (to == null) return
  event.preventDefault()
  tab.value = TABS[(to + TABS.length) % TABS.length]
  await nextTick()
  document.getElementById(tabIds[tab.value])?.focus()
}
</script>

<template>
  <SettingsSection id="set-claude" :title="t('set.claude')">
    <p>{{ t('set.claudeP') }}</p>
    <ol class="steps">
      <li v-for="(step, i) in steps" :key="step.id" class="step">
        <p class="title"><span class="n" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>{{ t(`set.step.${step.id}`) }}</p>
        <CodeBlock block :shown="shown(step.text)" :copy="step.text" :what="t(`set.step.${step.id}`)" />
        <p v-if="step.containsSecret && apiKey && !revealed" class="note">{{ t('set.keyHidden') }}</p>
        <p v-if="step.id === 'skill'" class="note">
          {{ zipBefore }}<a :href="skillZip" download>{{ zipLink }}</a>{{ zipAfter }}
        </p>
      </li>
    </ol>
    <div class="foot">
      <p>{{ refBefore }}<code>{{ refFile }}</code>{{ refAfter }}</p>
      <p>{{ t('set.projectLine') }}</p>
      <CodeBlock :shown="RUNWAY_PROJECT_LINE" :what="t('set.projectLine')" />
      <p class="gap">{{ t('set.pluginUpdate') }}</p>
      <CodeBlock :shown="pluginUpdate" :what="t('set.pluginUpdate')" />
    </div>
  </SettingsSection>

  <SettingsSection id="set-mcp" :title="t('set.mcp')">
    <p>{{ t('set.mcpP') }}</p>
    <CodeBlock :shown="endpoint" :what="t('set.mcp')" />
    <div class="tabs" role="tablist" :aria-label="t('set.mcpClient')" @keydown="onTabKey">
      <button
        v-for="name in TABS" :id="tabIds[name]" :key="name" type="button" role="tab" class="tab"
        :aria-selected="tab === name" :tabindex="tab === name ? 0 : -1" aria-controls="mcp-panel" @click="tab = name"
      >{{ name }}</button>
    </div>
    <div id="mcp-panel" role="tabpanel" :aria-labelledby="tabIds[tab]">
      <CodeBlock block :shown="shown(snippets[tab])" :copy="snippets[tab]" :what="tab" />
    </div>
  </SettingsSection>
</template>

<style scoped>
.steps { list-style: none; margin: 4px 0 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 16px; }
.step { min-width: 0; }
.title { display: flex; gap: 10px; margin: 0 0 6px; color: var(--rw-text); font-size: 14px; line-height: 1.45; }
.n { font-family: var(--rw-font-mono); font-size: 11px; letter-spacing: 0.08em; color: var(--rw-mute); padding-top: 2px; }
.note, .foot p { margin: 6px 0 0; color: var(--rw-mute); font-size: 12.5px; line-height: 1.5; }
.note a { color: var(--rw-text); text-decoration: underline; text-underline-offset: 2px; }
.foot { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--rw-rule); }
.foot p { margin: 0 0 6px; }
.foot p:first-child { margin-bottom: 12px; }
.foot .gap { margin-top: 12px; }
code { font-family: var(--rw-font-mono); font-size: 12px; color: var(--rw-text); }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 8px; }
/* the chips' look (06 `.ctx`), selected as the pressed chip */
.tab {
  display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; border-radius: var(--rw-radius-pill);
  border: 1px solid var(--rw-rule); font-family: var(--rw-font-mono); font-size: 11.5px; letter-spacing: 0.02em; color: var(--rw-mute);
}
.tab:hover { color: var(--rw-text); border-color: var(--rw-rule-strong); }
.tab[aria-selected='true'] { background: var(--rw-inverse); color: var(--rw-on-inverse); border-color: var(--rw-inverse); }
@media (max-width: 760px) {
  .tab { min-height: 44px; }
}
</style>
