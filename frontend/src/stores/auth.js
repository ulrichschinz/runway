import { defineStore } from 'pinia'
import { ref } from 'vue'
import client from '../api/client.js'

export const useAuthStore = defineStore('auth', () => {
  const username = ref(localStorage.getItem('username') || null)
  const token = ref(localStorage.getItem('token') || null)

  async function login(user, pass) {
    const { data } = await client.post('/auth/login', { username: user, password: pass })
    token.value = data.access_token
    username.value = user
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('username', user)
  }

  async function register(user, pass) {
    await client.post('/auth/register', { username: user, password: pass })
    await login(user, pass)
  }

  function logout() {
    token.value = null
    username.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('username')
  }

  return { username, token, login, register, logout }
})
