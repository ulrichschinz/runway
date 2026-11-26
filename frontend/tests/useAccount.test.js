import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// useAccount's one-request-at-a-time rule (brief 0061, review): the API client is a fake whose
// answers the test releases one by one, so a second click can land while the first request is out.
const calls = []
vi.mock('../src/api/client.js', () => {
  const call = (method) => (url, body) => new Promise((resolve, reject) => calls.push({ method, url, body, resolve, reject }))
  return { default: { get: call('get'), put: call('put'), post: call('post'), delete: call('delete') } }
})
const adopted = []
vi.mock('../src/stores/auth.js', () => ({ useAuthStore: () => ({ fetchMe: async () => {}, adoptToken: (t) => adopted.push(t) }) }))
const { useAccount } = await import('../src/identity/useAccount.js')

const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick()
}
/** Answer the oldest open call to `url`. */
async function answer(method, url, outcome) {
  const i = calls.findIndex((c) => c.method === method && c.url === url)
  expect(i, `${method} ${url} was asked`).toBeGreaterThanOrEqual(0)
  const [c] = calls.splice(i, 1)
  if (outcome instanceof Error) c.reject(outcome)
  else c.resolve({ data: outcome })
  await flush()
}
const httpError = (status) => Object.assign(new Error(String(status)), { response: { status } })
const sent = (method, url) => calls.filter((c) => c.method === method && c.url === url)

let account
beforeEach(() => {
  calls.length = 0
  adopted.length = 0
  account = useAccount()
})

describe('the registration switch', () => {
  it('a second click while the first is out sends nothing, so two clicks cannot both send "on"', async () => {
    account.registration.value = false
    const first = account.toggleRegistration()
    expect(account.pending('reg')).toBe(true)
    expect(await account.toggleRegistration()).toEqual({ busy: true })
    expect(sent('put', '/admin/settings').map((c) => c.body)).toEqual([{ allow_registration: true }])
    await answer('put', '/admin/settings', { allow_registration: true })
    expect(await first).toEqual({ ok: true })
    expect(account.pending('reg')).toBe(false)
  })

  it('the next click after the answer flips it back', async () => {
    account.registration.value = false
    const first = account.toggleRegistration()
    await answer('put', '/admin/settings', { allow_registration: true })
    await first
    const second = account.toggleRegistration()
    expect(sent('put', '/admin/settings').map((c) => c.body)).toEqual([{ allow_registration: false }])
    await answer('put', '/admin/settings', { allow_registration: false })
    expect(await second).toEqual({ ok: true })
    expect(account.registration.value).toBe(false)
  })

  it('a failed request frees the switch and keeps the value', async () => {
    account.registration.value = false
    const first = account.toggleRegistration()
    await answer('put', '/admin/settings', httpError(500))
    expect(await first).toEqual({ error: 'set.failed' })
    expect(account.pending('reg')).toBe(false)
    expect(account.registration.value).toBe(false)
  })
})

describe('"Neuen Key erzeugen" (brief 0070: shown once)', () => {
  const META = { key_id: '0123456789abcdef', label: 'agent', kind: 'issued', prefix: 'rwk_0123456789abcdef', state: 'active' }

  it('a double click creates one key, and the key is held only until it is confirmed stored', async () => {
    const first = account.createKey('agent')
    expect(await account.createKey('agent')).toEqual({ busy: true })
    expect(sent('post', '/auth/apikeys').map((c) => c.body)).toEqual([{ label: 'agent' }])
    await answer('post', '/auth/apikeys', { ...META, api_key: 'rwk_0123456789abcdef_placeholder' })
    expect(await first).toEqual({ ok: true })
    expect(account.apiKey.value).toBe('rwk_0123456789abcdef_placeholder')
    // the list keeps the metadata only, never the key
    expect(account.keys.value).toEqual([META])
    expect(account.dismissKey(false)).toEqual({ forgotten: false, reason: 'set.key.confirmFirst' })
    expect(account.apiKey.value).toBe('rwk_0123456789abcdef_placeholder')
    expect(account.dismissKey(true)).toEqual({ forgotten: true })
    expect(account.apiKey.value).toBeNull()
  })

  it('says so at the cap', async () => {
    const first = account.createKey('')
    await answer('post', '/auth/apikeys', httpError(409))
    expect(await first).toEqual({ error: 'set.key.tooMany' })
    expect(account.apiKey.value).toBeNull()
  })

  it('never reads a key back: loading asks for metadata only', async () => {
    const loading = account.loadKeys()
    expect(sent('get', '/auth/apikey')).toHaveLength(0)
    await answer('get', '/auth/apikeys', [META])
    await loading
    expect(account.keys.value).toEqual([META])
  })

  it('a revocation is sent once and the list is read again', async () => {
    const first = account.revokeKey(META.key_id)
    expect(await account.revokeKey(META.key_id)).toEqual({ busy: true })
    await answer('delete', `/auth/apikeys/${META.key_id}`, null)
    await answer('get', '/auth/apikeys', [{ ...META, state: 'revoked' }])
    expect(await first).toEqual({ ok: true })
    expect(account.keys.value[0].state).toBe('revoked')
  })
})

describe('the role buttons', () => {
  const A = { username: 'anna', role: 'user' }
  const B = { username: 'bert', role: 'user' }

  it('each user is busy on their own: B pending leaves A pending, and A answering leaves B pending', async () => {
    account.users.value = [A, B]
    const a = account.toggleRole(A)
    const b = account.toggleRole(B)
    expect(account.pending('role:anna')).toBe(true)
    expect(account.pending('role:bert')).toBe(true)
    expect(await account.toggleRole(A)).toEqual({ busy: true })
    expect(sent('put', '/admin/users/anna/role')).toHaveLength(1)

    await answer('put', '/admin/users/anna/role', { ...A, role: 'admin' })
    expect(await a).toEqual({ ok: true })
    expect(account.pending('role:anna')).toBe(false)
    expect(account.pending('role:bert')).toBe(true)

    await answer('put', '/admin/users/bert/role', httpError(409))
    expect(await b).toEqual({ error: 'set.admin.lastAdmin' })
    expect(account.pending('role:bert')).toBe(false)
    expect(account.users.value.map((u) => u.role)).toEqual(['admin', 'user'])
  })
})

describe('the profile and the password', () => {
  it('a second submit while the first is out sends nothing', async () => {
    const first = account.saveProfile({ fullName: 'Anna', email: 'anna@example.com' })
    expect(await account.saveProfile({ fullName: 'Anna', email: 'anna@example.com' })).toEqual({ busy: true })
    expect(sent('put', '/auth/me')).toHaveLength(1)
    await answer('put', '/auth/me', { full_name: 'Anna', email: 'anna@example.com' })
    expect(await first).toEqual({ ok: true })

    const form = { current: 'alt', next: 'neu-lang-genug', confirm: 'neu-lang-genug' }
    const pw = account.changePassword(form)
    expect(await account.changePassword(form)).toEqual({ busy: true })
    expect(sent('put', '/auth/password')).toHaveLength(1)
    await answer('put', '/auth/password', httpError(400))
    expect(await pw).toEqual({ error: 'set.pw.wrong' })
    expect(account.pending('password')).toBe(false)
  })

  it('a form the rules refuse sends nothing and blocks nothing', async () => {
    expect(await account.changePassword({ current: 'alt', next: 'a', confirm: 'b' })).toEqual({ error: 'set.pw.mismatch' })
    expect(account.pending('password')).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('a password change ends every earlier session (REV-001, ADR 0044)', () => {
  it('keeps the token the answer carries, so this session survives its own revocation', async () => {
    const pw = account.changePassword({ current: 'alt', next: 'neu-lang-genug', confirm: 'neu-lang-genug' })
    await answer('put', '/auth/password', { detail: 'Password updated', access_token: 'eyJ.neu', token_type: 'bearer' })
    expect(await pw).toEqual({ ok: true })
    expect(adopted).toEqual(['eyJ.neu'])
  })

  it('a 422 says the rule, not "wrong password" (SEC-006)', async () => {
    const pw = account.changePassword({ current: 'alt', next: 'neu-lang-genug', confirm: 'neu-lang-genug' })
    await answer('put', '/auth/password', httpError(422))
    expect(await pw).toEqual({ error: 'set.pw.rule' })
  })

  it('a refused change keeps the session it has', async () => {
    const pw = account.changePassword({ current: 'falsch', next: 'neu-lang-genug', confirm: 'neu-lang-genug' })
    await answer('put', '/auth/password', httpError(400))
    expect(await pw).toEqual({ error: 'set.pw.wrong' })
    expect(adopted).toEqual([])
  })
})
