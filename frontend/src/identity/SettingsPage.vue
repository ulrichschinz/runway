<script setup>
/**
 * Einstellungen (plan M14, brief 0061; 06 `renderHead('settings')`, `renderSettings`; every section
 * and request of the old `views/SettingsView.vue`), German and in the brand, in 06's `.set` rows:
 *
 * - **Konto:** name and e-mail (`PUT /auth/me`), behind "Profil bearbeiten".
 * - **Passwort:** current, new, repeated (`PUT /auth/password`), checked before it is sent.
 * - **API-Key:** hidden but for its last four characters; Anzeigen, Kopieren (Android's "Key
 *   einfügen" says to copy it here), "Neuen Key erzeugen …" asks first.
 * - **Claude verbinden**, **MCP-Server** (`ClaudeSettings`): the shared modules' steps and tabs.
 * - **Darstellung:** System / Hell / Dunkel, the frame's theme choice (`useTheme` behind it).
 * - **Sprache**; **Verwaltung** for an admin (`AdminSettings`); **Abmelden**.
 *
 * `fe/identity` imports no other feature: it reports in place, not on the task notice. The margin
 * column's panels stand beside it as on every page (plan M12).
 *
 * Each section's answer ("Gespeichert", "Passwort geändert", an error) is in one status region that
 * is always in the page, outside the form and its closed state: a region inserted with its text
 * already in it is often not read, least of all while the focus moves back to the opener. A button
 * busy with its request is `aria-disabled` and ignores a second press (`useAccount` sends one request
 * per action), so the focus stays on it instead of dropping to the page.
 */
import './texts.js'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import AppFrame from '../layout/AppFrame.vue'
import EyebrowLine from '../layout/ui/EyebrowLine.vue'
import PageHeading from '../layout/ui/PageHeading.vue'
import PillButton from '../layout/ui/PillButton.vue'
import { useFrame } from '../composables/useFrame.js'
import { t } from '../shared/i18n.js'
import { maskKey } from '../shared/settingsRules.js'
import AdminSettings from './AdminSettings.vue'
import ClaudeSettings from './ClaudeSettings.vue'
import CodeBlock from './CodeBlock.vue'
import SettingsSection from './SettingsSection.vue'
import { useAccount } from './useAccount.js'

const frame = useFrame()
const account = useAccount()
const auth = account.auth

onMounted(account.loadKey)

/** A status key as the region's text and whether it is a refusal; '' while there is nothing to say. */
function said(status, good) {
  if (!status || status === 'saving') return { text: '', bad: false }
  return { text: t(status === good ? goodText[good] : status), bad: status !== good }
}
const goodText = { saved: 'set.saved', done: 'set.pw.done', key: 'set.regenDone' }

const roleLabel = computed(() => t(auth.role === 'admin' ? 'set.role.admin' : 'set.role.user'))
const eyebrow = computed(() => [t('nav.settings'), auth.username ?? '', roleLabel.value])
const THEMES = [['system', 'set.system'], ['light', 'set.light'], ['dark', 'set.dark']]

/** Put the focus on an element once it is rendered (a form that just opened, or its opener after it closed). */
async function focusOn(target) {
  await nextTick()
  target.value?.focus?.()
  target.value?.$el?.focus?.()
}

// ── Konto ───────────────────────────────────────────────────────────────────────────
const editing = ref(false)
const profile = reactive({ fullName: '', email: '' })
/** '' | 'saving' | 'saved' | an error key */
const profileStatus = ref('')
const nameField = ref(null)
const profileOpener = ref(null)

function openProfile() {
  profile.fullName = auth.fullName ?? ''
  profile.email = auth.email ?? ''
  profileStatus.value = ''
  editing.value = true
  focusOn(nameField)
}

function closeProfile() {
  editing.value = false
  focusOn(profileOpener)
}

const profileSaid = computed(() => said(profileStatus.value, 'saved'))

async function saveProfile() {
  if (profileStatus.value === 'saving') return
  profileStatus.value = 'saving'
  const result = await account.saveProfile({ fullName: profile.fullName.trim(), email: profile.email.trim() })
  profileStatus.value = result.error ?? 'saved'
  if (result.ok) closeProfile()
}

// ── Passwort ────────────────────────────────────────────────────────────────────────
const changing = ref(false)
const pw = reactive({ current: '', next: '', confirm: '' })
/** '' | 'saving' | 'done' | an error key */
const pwStatus = ref('')
const pwField = ref(null)
const pwOpener = ref(null)

function openPassword() {
  pwStatus.value = ''
  changing.value = true
  focusOn(pwField)
}

function closePassword() {
  pw.current = ''
  pw.next = ''
  pw.confirm = ''
  changing.value = false
  focusOn(pwOpener)
}

const pwSaid = computed(() => said(pwStatus.value, 'done'))

async function changePassword() {
  if (pwStatus.value === 'saving') return
  pwStatus.value = 'saving'
  const result = await account.changePassword({ ...pw })
  pwStatus.value = result.error ?? 'done'
  if (result.ok) closePassword()
}

// ── API-Key ─────────────────────────────────────────────────────────────────────────
const revealed = ref(false)
const asking = ref(false)
/** '' | 'key' (a new key) | an error key */
const keyStatus = ref('')
const keySaid = computed(() => said(keyStatus.value, 'key'))
const regenOpener = ref(null)
const regenKeep = ref(null)
const shownKey = computed(() => (revealed.value ? account.apiKey.value : maskKey(account.apiKey.value)))

function askRegenerate() {
  keyStatus.value = ''
  asking.value = true
  focusOn(regenKeep)
}

function keepKey() {
  asking.value = false
  focusOn(regenOpener)
}

async function regenerate() {
  if (account.pending('key')) return
  const result = await account.regenerateKey()
  if (result.busy) return
  asking.value = false
  keyStatus.value = result.error ?? 'key'
  if (result.ok) revealed.value = true
  focusOn(regenOpener)
}

/** `Esc` inside an open form closes it, as everywhere in the new UI; the frame's own `Esc` is not asked. */
function escape(event, close) {
  if (event.key !== 'Escape' || event.isComposing) return
  event.preventDefault()
  event.stopPropagation()
  close()
}
</script>

<template>
  <AppFrame v-bind="frame.props.value" v-on="frame.on">
    <template #head>
      <div class="text">
        <EyebrowLine :parts="eyebrow" />
        <PageHeading :parts="t('h.settings')" />
      </div>
    </template>

    <div class="sets">
      <SettingsSection id="set-account" :title="t('set.account')">
        <form v-if="editing" class="form" @submit.prevent="saveProfile" @keydown="escape($event, closeProfile)">
          <label class="field">
            <span>{{ t('set.name') }}</span>
            <input ref="nameField" v-model="profile.fullName" type="text" autocomplete="name" :placeholder="t('set.namePh')">
          </label>
          <label class="field">
            <span>{{ t('set.email') }}</span>
            <input v-model="profile.email" type="email" autocomplete="email" :placeholder="t('set.emailPh')">
          </label>
          <div class="acts">
            <PillButton type="submit" :aria-disabled="profileStatus === 'saving' || undefined">
              {{ profileStatus === 'saving' ? t('set.saving') : t('set.save') }}
            </PillButton>
            <PillButton quiet @click="closeProfile">{{ t('set.cancel') }}</PillButton>
          </div>
        </form>
        <template v-else>
          <p class="who">
            <span class="strong">{{ auth.fullName || t('set.noName') }}</span>
            <template v-if="auth.email"> · {{ auth.email }}</template>
            · {{ auth.username }} · {{ roleLabel }}
          </p>
          <div class="acts">
            <PillButton ref="profileOpener" @click="openProfile">{{ t('set.profile') }}</PillButton>
          </div>
        </template>
        <p class="status" :class="{ bad: profileSaid.bad }" role="status">{{ profileSaid.text }}</p>
      </SettingsSection>

      <SettingsSection id="set-password" :title="t('set.password')">
        <form v-if="changing" class="form" @submit.prevent="changePassword" @keydown="escape($event, closePassword)">
          <!-- the account name, for the browser's password manager -->
          <input class="hidden" type="text" autocomplete="username" :value="auth.username" readonly tabindex="-1" aria-hidden="true">
          <label class="field">
            <span>{{ t('set.pw.current') }}</span>
            <input ref="pwField" v-model="pw.current" type="password" autocomplete="current-password">
          </label>
          <label class="field">
            <span>{{ t('set.pw.new') }}</span>
            <input v-model="pw.next" type="password" autocomplete="new-password">
          </label>
          <label class="field">
            <span>{{ t('set.pw.confirm') }}</span>
            <input v-model="pw.confirm" type="password" autocomplete="new-password">
          </label>
          <div class="acts">
            <PillButton type="submit" :aria-disabled="pwStatus === 'saving' || undefined">
              {{ pwStatus === 'saving' ? t('set.saving') : t('set.pwChange') }}
            </PillButton>
            <PillButton quiet @click="closePassword">{{ t('set.cancel') }}</PillButton>
          </div>
        </form>
        <div v-else class="acts">
          <PillButton ref="pwOpener" @click="openPassword">{{ t('set.pwChange') }}</PillButton>
        </div>
        <p class="status" :class="{ bad: pwSaid.bad }" role="status">{{ pwSaid.text }}</p>
      </SettingsSection>

      <SettingsSection id="set-key" :title="t('set.apiKey')">
        <p>{{ t('set.apiKeyP') }}</p>
        <p v-if="account.keyState.value === 'loading' && !account.apiKey.value">{{ t('set.keyLoading') }}</p>
        <div v-else-if="account.keyState.value === 'failed' && !account.apiKey.value" class="acts">
          <span class="status bad">{{ t('set.loadFailed') }}</span>
          <PillButton quiet @click="account.loadKey">{{ t('set.reload') }}</PillButton>
        </div>
        <template v-else-if="account.apiKey.value">
          <CodeBlock :shown="shownKey" :copy="account.apiKey.value" :what="t('set.keyOf')">
            <PillButton quiet class="reveal" @click="revealed = !revealed">
              {{ revealed ? t('set.hide') : t('set.show') }}
            </PillButton>
          </CodeBlock>
          <div v-if="asking" class="ask" role="group" :aria-label="t('set.regenGo')">
            <p class="q">{{ t('set.regenQ') }}</p>
            <div class="acts">
              <PillButton :aria-disabled="account.pending('key') || undefined" @click="regenerate">{{ t('set.regenGo') }}</PillButton>
              <PillButton ref="regenKeep" quiet @click="keepKey">{{ t('set.cancel') }}</PillButton>
            </div>
          </div>
          <div v-else class="acts">
            <PillButton ref="regenOpener" quiet class="regen" @click="askRegenerate">{{ t('set.regen') }}</PillButton>
          </div>
        </template>
        <p class="status" :class="{ bad: keySaid.bad }" role="status">{{ keySaid.text }}</p>
      </SettingsSection>

      <ClaudeSettings :api-key="account.apiKey.value" :revealed="revealed" />

      <SettingsSection id="set-look" :title="t('set.look')">
        <div class="themes" role="group" :aria-label="t('set.look')">
          <button
            v-for="[value, key] in THEMES" :key="value" type="button" class="chip"
            :aria-pressed="frame.props.value.themeChoice === value" @click="frame.on.theme(value)"
          >{{ t(key) }}</button>
        </div>
      </SettingsSection>

      <SettingsSection id="set-lang" :title="t('set.lang')">
        <p>{{ t('set.langP') }}</p>
      </SettingsSection>

      <AdminSettings v-if="auth.role === 'admin'" :me="auth.username ?? ''" />
    </div>

    <div class="out">
      <PillButton @click="frame.on.signout">{{ t('set.signout') }}</PillButton>
      <span class="status">{{ t('set.signoutP') }}</span>
    </div>

    <template #margin><component :is="frame.margin" :view="frame.props.value.view" /></template>
  </AppFrame>
</template>

<style scoped>
.text { display: grid; row-gap: 12px; }
.sets { margin-top: 10px; }
.who { margin: 0 0 10px; color: var(--rw-mute); font-size: 13.5px; line-height: 1.5; overflow-wrap: anywhere; }
.strong { color: var(--rw-text); font-weight: 500; }
.acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.status { font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); }
.status.bad { color: var(--rw-overdue); }
p.status { margin: 8px 0 0; }
p.status:empty { margin: 0; }
.form { display: grid; row-gap: 12px; max-width: 420px; }
.field { display: grid; row-gap: 4px; }
.field span { font-family: var(--rw-font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--rw-mute); }
.field input {
  min-height: 44px; padding: 0 12px; border-radius: var(--rw-radius-sm); border: 1px solid var(--rw-rule-strong);
  background: transparent; color: var(--rw-text); font: inherit; font-size: 15px;
}
.field input::placeholder { color: var(--rw-soft); }
.hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.reveal { flex: none; }
.ask { margin-top: 10px; }
.q { margin: 0 0 8px; color: var(--rw-text); font-size: 13.5px; line-height: 1.5; }
.acts:has(.regen) { margin-top: 8px; }
.themes { display: flex; flex-wrap: wrap; gap: 6px; }
/* the chips' look (06 `.ctx`), pressed as the chosen one */
.chip {
  display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; border-radius: var(--rw-radius-pill);
  border: 1px solid var(--rw-rule); font-family: var(--rw-font-mono); font-size: 11.5px; letter-spacing: 0.02em; color: var(--rw-mute);
}
.chip:hover { color: var(--rw-text); border-color: var(--rw-rule-strong); }
.chip[aria-pressed='true'] { background: var(--rw-inverse); color: var(--rw-on-inverse); border-color: var(--rw-inverse); }
.out { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin: 22px 0 8px; }
@media (max-width: 760px) {
  .text { row-gap: 8px; }
  .chip { min-height: 44px; }
}
</style>
