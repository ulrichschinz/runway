<script setup>
/**
 * Einstellungen (plan M14, brief 0061; 06 `renderHead('settings')`, `renderSettings`; every section
 * and request of the old `views/SettingsView.vue`), German and in the brand, in 06's `.set` rows:
 *
 * - **Konto:** name and e-mail (`PUT /auth/me`), behind "Profil bearbeiten".
 * - **Passwort:** current, new, repeated (`PUT /auth/password`), checked before it is sent.
 * - **API-Keys** (brief 0070): the account's keys as metadata (`GET /auth/apikeys`), each with
 *   "Widerrufen …" behind a question; "Neuen Key erzeugen" (optional label) shows the new key ONCE —
 *   hidden but for its last four characters until "Anzeigen", Kopieren and Herunterladen — and keeps
 *   it on the screen until "Ich habe ihn gespeichert" is ticked and confirmed. The server keeps only
 *   a hash; the page never reads a key back and never stores one.
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
import { useRoute } from 'vue-router'
import AppFrame from '../layout/AppFrame.vue'
import EyebrowLine from '../layout/ui/EyebrowLine.vue'
import PageHeading from '../layout/ui/PageHeading.vue'
import PillButton from '../layout/ui/PillButton.vue'
import { useFrame } from '../composables/useFrame.js'
import { t } from '../shared/i18n.js'
import { canRevoke, day, keyFile, keyName, keyStateKey, legacyDeadline, orderedKeys } from '../shared/apiKeys.js'
import { maskKey } from '../shared/settingsRules.js'
import AdminSettings from './AdminSettings.vue'
import ClaudeSettings from './ClaudeSettings.vue'
import CodeBlock from './CodeBlock.vue'
import SettingsSection from './SettingsSection.vue'
import { useAccount } from './useAccount.js'

const frame = useFrame()
const account = useAccount()
const auth = account.auth

onMounted(account.loadKeys)

/** A status key as the region's text and whether it is a refusal; '' while there is nothing to say. */
function said(status, good) {
  if (!status || status === 'saving') return { text: '', bad: false }
  return { text: t(status === good ? goodText[good] : status), bad: status !== good }
}
const goodText = { saved: 'set.saved', done: 'set.pw.done' }

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
// The login sent this person here (`landingAfterLogin`): a bcrypt-era hash accepted a password of
// 72 bytes or more, which cannot be upgraded from what was typed (SEC-006). Say so, open the form.
const pwRequired = useRoute().query.password === 'change'
onMounted(() => {
  if (pwRequired) openPassword()
})

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

// ── API-Keys (brief 0070) ───────────────────────────────────────────────────────────
const revealed = ref(false)
/** '' | 'made' | 'revoked' | an error key */
const keyStatus = ref('')
const keySaid = computed(() => {
  const s = keyStatus.value
  if (!s) return { text: '', bad: false }
  if (s === 'made') return { text: t('set.key.made'), bad: false }
  if (s === 'revoked') return { text: t('set.key.revokedDone'), bad: false }
  return { text: t(s), bad: true }
})
const newLabel = ref('')
const stored = ref(false)
const createOpener = ref(null)
const freshBlock = ref(null)
/** The key id whose revocation is being asked about, or ''. */
const askingRevoke = ref('')
const revokeKeep = ref(null)
const shownKey = computed(() => (revealed.value ? account.apiKey.value : maskKey(account.apiKey.value)))
const keyRows = computed(() => orderedKeys(account.keys.value))
const deadline = computed(() => legacyDeadline(account.keys.value))
const nameOf = (meta) => {
  const n = keyName(meta)
  return n.key ? t(n.key) : n.text
}

async function createKey() {
  if (account.pending('key')) return
  keyStatus.value = ''
  const result = await account.createKey(newLabel.value)
  if (result.busy) return
  keyStatus.value = result.error ?? 'made'
  if (result.ok) {
    newLabel.value = ''
    stored.value = false
    revealed.value = false
    focusOn(freshBlock)
  }
}

function downloadKey() {
  const file = keyFile(account.apiKey.value, window.location.origin)
  const url = URL.createObjectURL(new Blob([file.text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  URL.revokeObjectURL(url)
}

function doneWithKey() {
  const result = account.dismissKey(stored.value)
  keyStatus.value = result.forgotten ? '' : result.reason
  if (result.forgotten) {
    revealed.value = false
    focusOn(createOpener)
  }
}

function askRevoke(keyId) {
  keyStatus.value = ''
  askingRevoke.value = keyId
  focusOn(revokeKeep)
}

function keepRevoke() {
  askingRevoke.value = ''
}

async function revoke(keyId) {
  const result = await account.revokeKey(keyId)
  if (result.busy) return
  askingRevoke.value = ''
  keyStatus.value = result.error ?? 'revoked'
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
          <p v-if="pwRequired" class="status bad" role="status">{{ t('set.pw.required') }}</p>
          <p>{{ t('set.pw.hint') }}</p>
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
        <p v-if="deadline" class="status bad">{{ t('set.key.legacyDeadline').replace('{day}', deadline) }}</p>

        <div v-if="account.apiKey.value" ref="freshBlock" class="fresh" tabindex="-1" role="group" :aria-label="t('set.key.freshTitle')">
          <p class="q">{{ t('set.key.freshP') }}</p>
          <CodeBlock :shown="shownKey" :copy="account.apiKey.value" :what="t('set.keyOf')">
            <PillButton quiet class="reveal" @click="revealed = !revealed">
              {{ revealed ? t('set.hide') : t('set.show') }}
            </PillButton>
          </CodeBlock>
          <div class="acts">
            <PillButton quiet @click="downloadKey">{{ t('set.key.download') }}</PillButton>
          </div>
          <label class="confirm">
            <input v-model="stored" type="checkbox">
            <span>{{ t('set.key.stored') }}</span>
          </label>
          <div class="acts">
            <PillButton :aria-disabled="!stored || undefined" @click="doneWithKey">{{ t('set.key.done') }}</PillButton>
          </div>
        </div>
        <form v-else class="form" @submit.prevent="createKey">
          <label class="field">
            <span>{{ t('set.key.label') }}</span>
            <input v-model="newLabel" type="text" maxlength="64" autocomplete="off" :placeholder="t('set.key.labelPh')">
          </label>
          <div class="acts">
            <PillButton ref="createOpener" type="submit" :aria-disabled="account.pending('key') || undefined">{{ t('set.key.create') }}</PillButton>
          </div>
        </form>

        <p v-if="account.keyState.value === 'loading' && !keyRows.length">{{ t('set.keyLoading') }}</p>
        <div v-else-if="account.keyState.value === 'failed'" class="acts">
          <span class="status bad">{{ t('set.loadFailed') }}</span>
          <PillButton quiet @click="account.loadKeys">{{ t('set.reload') }}</PillButton>
        </div>
        <p v-else-if="!keyRows.length" class="status">{{ t('set.key.none') }}</p>
        <ul v-else class="keys">
          <li v-for="k in keyRows" :key="k.key_id" class="key" :class="{ ended: k.state !== 'active' }">
            <span class="kname">{{ nameOf(k) }}</span>
            <span class="kmeta">
              {{ t(keyStateKey(k)) }}
              · {{ t('set.key.created') }} {{ day(k.created_at) }}
              <template v-if="k.expires_at"> · {{ t('set.key.expires') }} {{ day(k.expires_at) }}</template>
              · {{ k.last_used_at ? t('set.key.used') + ' ' + day(k.last_used_at) : t('set.key.neverUsed') }}
            </span>
            <template v-if="canRevoke(k)">
              <div v-if="askingRevoke === k.key_id" class="ask" role="group" :aria-label="t('set.key.revokeGo')">
                <p class="q">{{ t('set.key.revokeQ') }}</p>
                <div class="acts">
                  <PillButton :aria-disabled="account.pending(`revoke:${k.key_id}`) || undefined" @click="revoke(k.key_id)">{{ t('set.key.revokeGo') }}</PillButton>
                  <PillButton ref="revokeKeep" quiet @click="keepRevoke">{{ t('set.cancel') }}</PillButton>
                </div>
              </div>
              <div v-else class="acts">
                <PillButton quiet @click="askRevoke(k.key_id)">{{ t('set.key.revoke') }}</PillButton>
              </div>
            </template>
          </li>
        </ul>
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
.fresh { display: grid; row-gap: 10px; margin: 4px 0 14px; }
.confirm { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--rw-text); }
.keys { list-style: none; margin: 14px 0 0; padding: 0; display: grid; row-gap: 12px; }
.key { display: grid; row-gap: 4px; }
.key.ended { opacity: 0.6; }
.kname { color: var(--rw-text); font-weight: 500; overflow-wrap: anywhere; }
.kmeta { font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); }
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
