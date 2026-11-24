/**
 * The session, as both UIs see it (brief 0075, ADR 0047).
 *
 * Storage holds only what a reload needs to stay signed in — the token, the username and the
 * account id `/auth/me` names (`shared/browserStorage.js`). The role, the name and the e-mail are
 * memory only and come from `/auth/me` on every store creation, i.e. on every page load: a role
 * written into `localStorage` never renders the admin UI (RISK-SEC-001; the REST guards stay the
 * security boundary). `logout()` is the explicit logout of decision D6: it asks before discarding
 * unsent changes, purges the account's data and leaves with a full page load.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import client from '../api/client.js'
import {
  ACCOUNT_BOUND, KEY, accountOf, bindAccount, readToken, readUsername, signOut, startSession,
} from '../shared/browserStorage.js'
import { t } from '../shared/i18n.js'

export const useAuthStore = defineStore('auth', () => {
  const username = ref(readUsername())
  const token = ref(readToken())
  // Never read from storage: `user` until the server says otherwise.
  const role = ref('user')
  const fullName = ref('')
  const email = ref('')
  /** The account this page is bound to, so another tab's change of it is seen. */
  let boundId = token.value ? accountOf() : null

  async function fetchMe() {
    try {
      const { data } = await client.get('/auth/me')
      role.value = data.role === 'admin' ? 'admin' : 'user'
      fullName.value = data.full_name ?? ''
      email.value = data.email ?? ''
      if (data.username) username.value = data.username
      const bound = bindAccount({ accountId: data.account_id, username: data.username, createdAt: data.created_at })
      if (bound) boundId = accountOf()
      if (bound && typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new Event(ACCOUNT_BOUND))
        } catch {
          // No event support: the outbox binds on its next change instead.
        }
      }
    } catch {
      // Not authenticated (yet): the role stays `user`.
    }
  }

  async function login(user, pass) {
    const { data } = await client.post('/auth/login', { username: user, password: pass })
    token.value = data.access_token
    username.value = user
    role.value = 'user'
    // The login response names the account, so the namespace is bound even if /auth/me fails now.
    startSession({ token: data.access_token, username: user, accountId: data.account_id })
    boundId = accountOf()
    await fetchMe()
  }

  async function register(user, pass) {
    await client.post('/auth/register', { username: user, password: pass })
    await login(user, pass)
  }

  /**
   * Explicit logout. @returns {boolean} false when the user kept the unsent changes ("Abbrechen")
   */
  function logout() {
    const ended = signOut({
      confirm: (n) => window.confirm(t('signout.discardQ', { n })),
      leave: () => window.location.assign('/login'),
    })
    if (!ended) return false
    token.value = null
    username.value = null
    role.value = 'user'
    fullName.value = ''
    email.value = ''
    return true
  }

  // Refresh the profile on every page load if already authenticated: the role is the server's.
  if (token.value) fetchMe()

  if (typeof window !== 'undefined') {
    // Another tab ended the session (a logout, a 401) or replaced it (another sign-in): this tab's
    // page and its in-memory snapshot go too, rather than going on showing the account's tasks or
    // rebinding its outbox to the new account. Registered whether or not this page started signed
    // in, since the old UI signs in without a full page load.
    window.addEventListener('storage', (event) => {
      if (event.key !== KEY.token && event.key !== KEY.accountId && event.key !== null) return
      const now = readToken()
      const id = accountOf()
      if (now === token.value && (!boundId || !id || id === boundId)) return
      if (!now) window.location.assign('/login')
      else window.location.reload()
    })
    // A page that came up offline has the role `user` and maybe no binding: ask again once online.
    window.addEventListener('online', () => {
      if (token.value) fetchMe()
    })
  }

  return { username, token, role, fullName, email, login, register, logout, fetchMe }
})
