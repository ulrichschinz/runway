<script setup>
/**
 * "Verwaltung" in Einstellungen, for an admin only (plan M14, brief 0061; the old `SettingsView.vue`
 * "Site Settings" and "Users"): whether new accounts may be created (`PUT /admin/settings`), and
 * every user with their role and a button that gives them the other one
 * (`PUT /admin/users/{name}/role`). The server refuses to demote the last admin (409); the page says
 * why. Your own row has no button.
 *
 * While a change is out (`useAccount`'s one request per action) its control is `aria-disabled`, not
 * `disabled`, so the focus stays on it; each role button names its user after its visible words; the
 * answers go to status regions that are always in the page, empty until there is something to say.
 */
import { onMounted, ref } from 'vue'
import PillButton from '../layout/ui/PillButton.vue'
import { t } from '../shared/i18n.js'
import SettingsSection from './SettingsSection.vue'
import { useAccount } from './useAccount.js'

const props = defineProps({
  /** the signed-in user, whose own row has no role button */
  me: { type: String, required: true },
})

const account = useAccount()
/** The registration switch's answer: '' | 'saved' | an error key. */
const regStatus = ref('')
/** Per user, the role button's error key. */
const roleStatus = ref({})
const rolePending = (user) => account.pending(`role:${user.username}`)

onMounted(account.loadAdmin)

async function toggleRegistration() {
  if (account.pending('reg')) return
  regStatus.value = ''
  const result = await account.toggleRegistration()
  if (!result.busy) regStatus.value = result.error ?? 'saved'
}

async function toggleRole(user) {
  if (rolePending(user)) return
  roleStatus.value = { ...roleStatus.value, [user.username]: '' }
  const result = await account.toggleRole(user)
  if (result.error) roleStatus.value = { ...roleStatus.value, [user.username]: result.error }
}
</script>

<template>
  <SettingsSection id="set-admin" :title="t('set.admin')">
    <p v-if="account.adminState.value === 'loading'">{{ t('set.loading') }}</p>
    <div v-else-if="account.adminState.value === 'failed'" class="failed">
      <p>{{ t('set.loadFailed') }}</p>
      <PillButton quiet @click="account.loadAdmin">{{ t('set.reload') }}</PillButton>
    </div>
    <template v-else>
      <div class="reg">
        <span class="lab">
          <span id="set-reg" class="name">{{ t('set.reg') }}</span>
          <span class="sub">{{ t('set.regP') }}</span>
        </span>
        <button
          type="button" role="switch" class="switch" :aria-checked="!!account.registration.value" aria-labelledby="set-reg"
          :aria-disabled="account.pending('reg') || undefined" @click="toggleRegistration"
        ><span class="knob" aria-hidden="true" /></button>
      </div>
      <p class="status" :class="{ bad: regStatus && regStatus !== 'saved' }" role="status">{{
        regStatus === 'saved' ? t('set.saved') : regStatus ? t(regStatus) : ''
      }}</p>

      <h3 class="users">{{ t('set.users') }}</h3>
      <ul class="list">
        <li v-for="u in account.users.value" :key="u.username" class="user">
          <span class="who">
            <span class="name">{{ u.username }}</span>
            <span v-if="u.full_name || u.email" class="sub">{{ [u.full_name, u.email].filter(Boolean).join(' · ') }}</span>
            <span class="sub bad err" role="status">{{ roleStatus[u.username] ? t(roleStatus[u.username]) : '' }}</span>
          </span>
          <span class="role" :class="{ admin: u.role === 'admin' }">{{ t(`set.role.${u.role === 'admin' ? 'admin' : 'user'}`) }}</span>
          <span v-if="u.username === props.me" class="you">{{ t('set.you') }}</span>
          <PillButton v-else quiet :aria-disabled="rolePending(u) || undefined" @click="toggleRole(u)">
            {{ u.role === 'admin' ? t('set.demote') : t('set.promote') }}<span class="vh"> ({{ u.username }})</span>
          </PillButton>
        </li>
      </ul>
    </template>
  </SettingsSection>
</template>

<style scoped>
.failed { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.failed p { margin: 0; color: var(--rw-mute); font-size: 13.5px; }
.reg { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.lab { display: grid; row-gap: 2px; min-width: 0; }
.name { font-size: 14.5px; font-weight: 500; color: var(--rw-text); overflow-wrap: anywhere; }
.sub { font-size: 12.5px; color: var(--rw-mute); overflow-wrap: anywhere; }
.bad { color: var(--rw-overdue); }
/* a switch in the brand: the pressed chip's inverse when on */
.switch {
  position: relative; flex: none; width: 52px; height: 30px; border-radius: var(--rw-radius-pill);
  border: 1px solid var(--rw-rule-strong); background: transparent;
  transition: background var(--rw-dur-fast), border-color var(--rw-dur-fast);
}
.switch::before { content: ''; position: absolute; inset: -7px -2px; } /* a 44 px target */
.knob {
  position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: var(--rw-mute);
  transition: transform var(--rw-dur-fast), background var(--rw-dur-fast);
}
.switch[aria-checked='true'] { background: var(--rw-inverse); border-color: var(--rw-inverse); }
.switch[aria-checked='true'] .knob { transform: translateX(22px); background: var(--rw-on-inverse); }
.switch[aria-disabled='true'] { opacity: 0.55; cursor: default; }
.status { margin: 8px 0 0; font-size: 12.5px; color: var(--rw-mute); }
.status:empty { margin: 0; }
.vh { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.status.bad { color: var(--rw-overdue); }
.users {
  margin: 22px 0 4px; font-family: var(--rw-font-mono); font-size: var(--rw-type-eyebrow-size); font-weight: 400;
  letter-spacing: var(--rw-type-eyebrow-tracking); color: var(--rw-mute);
}
.list { list-style: none; margin: 0; padding: 0; }
.user {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto; column-gap: 12px; align-items: center;
  min-height: 52px; border-bottom: 1px solid var(--rw-rule);
}
.user:last-child { border-bottom: 0; } /* the section draws the rule under the last one */
.who { display: grid; row-gap: 2px; min-width: 0; padding: 6px 0; }
.role { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.role.admin { color: var(--rw-text); }
.you { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); padding: 0 12px; }
@media (prefers-reduced-motion: reduce) {
  .switch, .knob { transition: none; }
}
@media (max-width: 760px) {
  .user { grid-template-columns: minmax(0, 1fr) auto; }
  .role { grid-column: 2; grid-row: 1; }
  .user > :last-child { grid-column: 1 / -1; justify-self: start; }
  .user > .pill { margin: -4px 0 4px -12px; } /* the quiet pill's text in line with the name */
  .you { padding: 0 0 10px; }
}
</style>
