<script setup>
/**
 * The new UI's login (plan M4, brief 0050): the brand's page, German, with the field names Android
 * pins (Benutzername, Passwort, Anmelden). After a login it returns to the `?next=` path the router
 * guard wrote — only a same-origin relative path (`safeNext`) — so a Custom Tab link such as
 * `/next?task=<uuid>` lands where it pointed. Registration is offered while the server allows it,
 * exactly as on the old page.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import client from '../api/client.js'
import BrandMark from '../components/BrandMark.vue'
import { useTheme } from '../composables/useTheme.js'
import EyebrowLine from '../layout/ui/EyebrowLine.vue'
import PageHeading from '../layout/ui/PageHeading.vue'
import PillButton from '../layout/ui/PillButton.vue'
import { t } from '../shared/i18n.js'
import { safeNext } from '../shared/returnPath.js'
import { useAuthStore } from '../stores/auth.js'

useTheme()
const auth = useAuthStore()
const route = useRoute()

const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const registering = ref(false)
// Fails open, as on the old page: the server refuses a closed registration with a message anyway.
const registrationOpen = ref(true)

onMounted(async () => {
  try {
    const { data } = await client.get('/auth/registration-status')
    registrationOpen.value = data.allow_registration
  } catch {
    registrationOpen.value = true
  }
})

const heading = computed(() => t(registering.value ? 'h.register' : 'h.login'))

function messageFor(e) {
  const status = e.response?.status
  if (status === 401) return t('login.refused')
  if (status === 429) return t('login.tooMany')
  if (status === 403) return t('login.closed')
  if (status === 400 && registering.value) return t('login.taken')
  return t('login.failed')
}

async function submit() {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    if (registering.value) await auth.register(username.value, password.value)
    else await auth.login(username.value, password.value)
    // A full load, not a router push: whatever the page still holds in memory (the task store of
    // an earlier session in this tab) must not be shown to the account that just logged in.
    window.location.assign(safeNext(route.query.next) ?? '/')
  } catch (e) {
    error.value = messageFor(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="rw login">
    <main class="col">
      <div class="lockup"><BrandMark :size="32" /><span>{{ t('brand.name') }}</span></div>
      <EyebrowLine :parts="[t('brand.product')]" class="eyebrow" />
      <PageHeading :parts="heading" />
      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span>{{ t('login.user') }}</span>
          <input v-model="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
        </label>
        <label class="field">
          <span>{{ t('login.password') }}</span>
          <input
            v-model="password" name="password" type="password" required
            :autocomplete="registering ? 'new-password' : 'current-password'"
          >
        </label>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <PillButton action type="submit" class="submit" :disabled="busy">
          {{ busy ? t('login.busy') : t(registering ? 'login.create' : 'login.submit') }}
        </PillButton>
        <PillButton v-if="registrationOpen" quiet @click="registering = !registering; error = ''">
          {{ t(registering ? 'login.toLogin' : 'login.toRegister') }}
        </PillButton>
      </form>
    </main>
  </div>
</template>

<style scoped>
.login { min-height: 100dvh; display: grid; place-items: center; padding: 32px 16px; background: var(--rw-bg); color: var(--rw-text); }
.col { width: min(400px, 100%); }
.lockup { display: inline-flex; align-items: center; gap: 10px; font-weight: 500; font-size: 16px; letter-spacing: var(--ar-tracking-snug); }
.eyebrow { margin: 36px 0 12px; }
.form { display: grid; gap: 14px; margin-top: 32px; }
.field { display: grid; gap: 6px; }
.field span { font-family: var(--rw-font-mono); font-size: 11px; letter-spacing: 0.02em; color: var(--rw-mute); }
.field input {
  min-height: 52px; padding: 0 20px; font-size: 16px; color: var(--rw-text); background: var(--rw-surface);
  border: 1px solid var(--rw-rule-strong); border-radius: var(--rw-radius-pill);
}
.field input:focus { border-color: var(--rw-marker); box-shadow: 0 0 0 1px var(--rw-marker); }
.error { margin: 0; padding-top: 8px; border-top: 1px solid var(--rw-overdue-mark); color: var(--rw-overdue); font-size: 14px; }
.submit { min-height: 52px; margin-top: 8px; font-size: 15px; }
</style>
