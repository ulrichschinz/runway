import { reactive, ref } from 'vue'
import client from '../api/client.js'
import { passwordError, roleAfter, roleError } from '../shared/settingsRules.js'
import { useAuthStore } from '../stores/auth.js'

/**
 * What Einstellungen reads and writes (plan M14, brief 0061), with the requests of the old
 * `views/SettingsView.vue`: the profile (`PUT /auth/me`), the password (`PUT /auth/password`), the
 * API key (`GET /auth/apikey`, `POST /auth/apikey/regenerate`) and, for an admin, the site's
 * registration and the users' roles (`/admin/settings`, `/admin/users`). Not through the outbox
 * (plan §6.4 lists none of them): each is one request, and the caller keeps what was typed when it
 * fails.
 *
 * Every write answers `{ ok: true }` or `{ error }`, `error` a message key of
 * `messages.settings.de.js`; nothing here throws.
 *
 * ONE REQUEST AT A TIME PER ACTION (brief 0061, review). A second click while the first request is
 * out sends nothing and answers `{ busy: true }`: two clicks on the registration switch would
 * otherwise both send the same value (the switch flips only on the answer), two on "Neuen Key
 * erzeugen" would rotate the key twice and could leave the page showing the one the server already
 * replaced, and a role button clicked twice would repeat the same change. Each action has its own
 * key (`reg`, `key`, `profile`, `password`, `role:<name>`), so a pending change on one user leaves
 * the other users' buttons free; `pending(key)` tells the page which one to show as busy.
 */

/** A failed request as a message key: no answer is the network, any other refusal the same text. */
const failure = (e) => (e?.response ? 'set.failed' : 'set.offline')

export function useAccount() {
  const auth = useAuthStore()

  /** The actions whose request is out, by key. */
  const inFlight = reactive(new Set())
  const pending = (key) => inFlight.has(key)
  /** Run `send` unless the same action is still out; free the key whatever the answer. */
  async function once(key, send) {
    if (inFlight.has(key)) return { busy: true }
    inFlight.add(key)
    try {
      return await send()
    } finally {
      inFlight.delete(key)
    }
  }

  const apiKey = ref(null)
  /** '' | 'loading' | 'failed' */
  const keyState = ref('')

  async function loadKey() {
    keyState.value = 'loading'
    try {
      const [{ data }] = await Promise.all([client.get('/auth/apikey'), auth.fetchMe()])
      apiKey.value = data.api_key
      keyState.value = ''
    } catch {
      keyState.value = 'failed'
    }
  }

  function regenerateKey() {
    return once('key', async () => {
      try {
        const { data } = await client.post('/auth/apikey/regenerate')
        apiKey.value = data.api_key
        return { ok: true }
      } catch (e) {
        return { error: failure(e) }
      }
    })
  }

  /** The profile as the old page saves it, and as `stores/auth.js` keeps it for the next load. */
  function saveProfile({ fullName, email }) {
    return once('profile', async () => {
      try {
        const { data } = await client.put('/auth/me', { full_name: fullName, email })
        auth.fullName = data.full_name
        auth.email = data.email
        try {
          localStorage.setItem('fullName', data.full_name)
          localStorage.setItem('email', data.email)
        } catch {
          // Storage refused: the profile is saved on the server, and the next load reads it there.
        }
        return { ok: true }
      } catch (e) {
        return { error: failure(e) }
      }
    })
  }

  function changePassword(form) {
    const refused = passwordError(form)
    if (refused) return Promise.resolve({ error: refused })
    return once('password', async () => {
      try {
        await client.put('/auth/password', { current_password: form.current, new_password: form.next })
        return { ok: true }
      } catch (e) {
        return { error: e?.response?.status === 400 ? 'set.pw.wrong' : failure(e) }
      }
    })
  }

  // ── an admin's ────────────────────────────────────────────────────────────────────
  const registration = ref(null)
  const users = ref([])
  /** '' | 'loading' | 'failed' */
  const adminState = ref('')

  async function loadAdmin() {
    adminState.value = 'loading'
    try {
      const [{ data: settings }, { data: list }] = await Promise.all([client.get('/admin/settings'), client.get('/admin/users')])
      registration.value = settings.allow_registration
      users.value = list
      adminState.value = ''
    } catch {
      adminState.value = 'failed'
    }
  }

  /** Flip registration: the value sent is read when the request starts, never while one is out. */
  function toggleRegistration() {
    return once('reg', async () => {
      try {
        const { data } = await client.put('/admin/settings', { allow_registration: !registration.value })
        registration.value = data.allow_registration
        return { ok: true }
      } catch (e) {
        return { error: failure(e) }
      }
    })
  }

  function toggleRole(user) {
    return once(`role:${user.username}`, async () => {
      try {
        const { data } = await client.put(`/admin/users/${encodeURIComponent(user.username)}/role`, { role: roleAfter(user.role) })
        users.value = users.value.map((u) => (u.username === data.username ? data : u))
        return { ok: true }
      } catch (e) {
        return { error: roleError(e?.response?.status) }
      }
    })
  }

  return {
    auth, pending,
    apiKey, keyState, loadKey, regenerateKey,
    saveProfile, changePassword,
    registration, users, adminState, loadAdmin, toggleRegistration, toggleRole,
  }
}
