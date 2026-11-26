import { defineStore } from 'pinia'
import { ref } from 'vue'
import client from '../api/client.js'

export const useAuthStore = defineStore('auth', () => {
  const username = ref(localStorage.getItem('username') || null)
  const token = ref(localStorage.getItem('token') || null)
  const role = ref(localStorage.getItem('role') || 'user')
  const fullName = ref(localStorage.getItem('fullName') || '')
  const email = ref(localStorage.getItem('email') || '')

  async function fetchMe() {
    try {
      const { data } = await client.get('/auth/me')
      role.value = data.role
      fullName.value = data.full_name
      email.value = data.email
      localStorage.setItem('role', data.role)
      localStorage.setItem('fullName', data.full_name)
      localStorage.setItem('email', data.email)
    } catch {
      // ignore — not authenticated yet
    }
  }

  async function login(user, pass) {
    const { data } = await client.post('/auth/login', { username: user, password: pass })
    token.value = data.access_token
    username.value = user
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('username', user)
    await fetchMe()
  }

  /**
   * Keep the token a password change returned (REV-001, ADR 0044). The change ends every session
   * issued before it, this one included; the server hands this session a token at the new version
   * so it carries on while every other browser and device is logged out.
   */
  function adoptToken(fresh) {
    token.value = fresh
    localStorage.setItem('token', fresh)
  }

  async function register(user, pass) {
    await client.post('/auth/register', { username: user, password: pass })
    await login(user, pass)
  }

  function logout() {
    token.value = null
    username.value = null
    role.value = 'user'
    fullName.value = ''
    email.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
    localStorage.removeItem('fullName')
    localStorage.removeItem('email')
  }

  // refresh profile on every page load if already authenticated
  if (token.value) fetchMe()

  return { username, token, role, fullName, email, login, register, logout, fetchMe, adoptToken }
})
