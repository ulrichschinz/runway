<template>
  <div class="login-bg min-h-screen flex items-center justify-center px-4">
    <div class="login-card w-full max-w-sm p-8">
      <div class="flex items-center gap-3 mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40" class="shrink-0">
          <g stroke="#3D2B5C" stroke-width="1.4" fill="none" opacity="0.55">
            <line x1="32" y1="14" x2="47.588" y2="23"/><line x1="47.588" y1="23" x2="47.588" y2="41"/>
            <line x1="47.588" y1="41" x2="32" y2="50"/><line x1="32" y1="50" x2="16.412" y2="41"/>
            <line x1="16.412" y1="41" x2="16.412" y2="23"/><line x1="16.412" y1="23" x2="32" y2="14"/>
            <line x1="32" y1="32" x2="32" y2="14"/><line x1="32" y1="32" x2="47.588" y2="23"/>
            <line x1="32" y1="32" x2="47.588" y2="41"/><line x1="32" y1="32" x2="32" y2="50"/>
            <line x1="32" y1="32" x2="16.412" y2="41"/><line x1="32" y1="32" x2="16.412" y2="23"/>
          </g>
          <circle cx="32" cy="32" r="3.6" fill="#3D2B5C"/><circle cx="47.588" cy="23" r="2.8" fill="#3D2B5C"/>
          <circle cx="47.588" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="50" r="2.8" fill="#3D2B5C"/>
          <circle cx="16.412" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="23" r="2.8" fill="#3D2B5C"/>
          <circle cx="32" cy="14" r="4.4" fill="#FF7A6B"/><circle cx="51.588" cy="19" r="2" fill="#F4C84A"/>
        </svg>
        <div>
          <h1 class="login-title">Runway</h1>
          <p class="login-sub">by Agentic Reach</p>
        </div>
      </div>

      <div class="space-y-4">
        <input v-model="username" type="text" placeholder="Benutzername" class="login-input w-full" />
        <input v-model="password" type="password" placeholder="Passwort" @keydown.enter="submit" class="login-input w-full" />
        <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>
        <button @click="submit" :disabled="loading" class="login-btn w-full">
          {{ loading ? 'Anmelden…' : mode === 'login' ? 'Anmelden' : 'Konto erstellen' }}
        </button>
        <button @click="mode = mode === 'login' ? 'register' : 'login'" class="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          {{ mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const mode = ref('login')

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(username.value, password.value)
    } else {
      await auth.register(username.value, password.value)
    }
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.detail || 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-bg {
  background: var(--ar-bg);
}

.login-card {
  background: var(--ar-paper);
  border-radius: 18px;
  box-shadow: var(--ar-shadow-lg);
  border: 1px solid var(--ar-hairline);
}

.login-title {
  font-family: var(--ar-font-sans);
  font-size: 20px;
  font-weight: 500;
  color: var(--ar-plum);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.login-sub {
  font-family: var(--ar-font-mono);
  font-size: 11px;
  color: var(--ar-mute);
  letter-spacing: 0.04em;
  margin-top: 2px;
}

.login-input {
  border: 1px solid var(--ar-hairline);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: var(--ar-font-sans);
  color: var(--ar-ink);
  background: var(--ar-paper);
  outline: none;
  transition: border-color 120ms, box-shadow 120ms;
}

.login-input:focus {
  border-color: var(--ar-plum);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ar-plum) 12%, transparent);
}

.login-input::placeholder {
  color: var(--ar-mute-soft);
}

.login-btn {
  background: var(--ar-coral);
  color: white;
  border: none;
  border-radius: 999px;
  padding: 11px 0;
  font-size: 14px;
  font-family: var(--ar-font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: opacity 120ms;
}

.login-btn:hover {
  opacity: 0.88;
}

.login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:global(.dark) .login-bg {
  background: #1a1228;
}

:global(.dark) .login-card {
  background: #231a38;
  border-color: rgba(255,255,255,0.08);
}

:global(.dark) .login-input {
  background: #2d2045;
  border-color: rgba(255,255,255,0.10);
  color: #f0eaf8;
}

:global(.dark) .login-input:focus {
  border-color: var(--ar-coral);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ar-coral) 18%, transparent);
}

:global(.dark) .login-title {
  color: #e2d9f3;
}

:global(.dark) .login-sub {
  color: rgba(255,255,255,0.45);
}
</style>
