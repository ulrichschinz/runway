<template>
  <div class="min-h-screen bg-indigo-50 dark:bg-gray-900 flex items-center justify-center px-4">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-8">
      <h1 class="text-2xl font-bold text-indigo-600 mb-1">Runway</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Sign in to your tasks</p>

      <div class="space-y-4">
        <input v-model="username" type="text" placeholder="Username" class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <input v-model="password" type="password" placeholder="Password" @keydown.enter="submit" class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>
        <button @click="submit" :disabled="loading" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
          {{ loading ? 'Signing in…' : mode === 'login' ? 'Sign in' : 'Create account' }}
        </button>
        <button @click="mode = mode === 'login' ? 'register' : 'login'" class="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          {{ mode === 'login' ? 'No account? Register' : 'Already have an account? Sign in' }}
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
