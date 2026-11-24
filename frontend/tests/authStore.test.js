import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// loaded before the fakes below replace `document`, as the real page loads it
import 'vue'

// What an explicit logout leaves in a shared browser profile (REV-006, RISK-SEC-001; brief 0075,
// ADR 0047). A synthetic profile — a Map behind a fake `localStorage` — and a fake API stand in for
// the browser and the server, so the real auth store, the real outbox and the real capture draft run
// together in node. Nothing is rendered (ADR 0007): the confirm dialog is `window.confirm`, stubbed.

/** The fake server: who holds which token, and each username's current account. */
const server = { accounts: new Map(), tokens: new Map(), seq: 0 }
function account(username, accountId, role = 'user') {
  server.accounts.set(username, { account_id: accountId, role })
}

/** The synthetic profile. */
let profile
const httpError = (status) => Object.assign(new Error(String(status)), { response: { status } })

vi.mock('../src/api/client.js', () => ({
  default: {
    post: vi.fn(async (url, body) => {
      if (url !== '/auth/login') throw httpError(404)
      const token = `tok-${body.username}-${++server.seq}`
      server.tokens.set(token, { username: body.username, account: server.accounts.get(body.username) })
      return { data: { access_token: token, token_type: 'bearer' } }
    }),
    get: vi.fn(async (url) => {
      if (url !== '/auth/me') return { data: [] }
      // The real interceptor sends the stored token.
      const session = server.tokens.get(profile.get('token'))
      if (!session) throw httpError(401)
      const { account_id, role } = session.account
      return { data: { username: session.username, role, full_name: 'Alice Example', email: 'a@example.com', account_id } }
    }),
    // Offline: every write fails without an answer, so it stays in the queue.
    request: vi.fn(async () => {
      throw new Error('Network Error')
    }),
    put: vi.fn(async () => ({ data: {} })),
  },
}))
vi.mock('../src/api/keepalive.js', () => ({ sendKeepalive: vi.fn(async () => ({ ok: false, status: 401, json: async () => null })) }))

const leave = vi.fn()
let answer = true
const asked = []

function fakeBrowser(entries = []) {
  profile = new Map(entries)
  vi.stubGlobal('localStorage', {
    getItem: (k) => (profile.has(k) ? profile.get(k) : null),
    setItem: (k, v) => profile.set(k, String(v)),
    removeItem: (k) => profile.delete(k),
    key: (i) => [...profile.keys()][i] ?? null,
    get length() {
      return profile.size
    },
  })
  vi.stubGlobal('window', {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    confirm: (text) => {
      asked.push(text)
      return answer
    },
    location: { assign: leave, pathname: '/inbox', search: '', hash: '', href: '/inbox' },
  })
  vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' })
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** A fresh page load: new modules, a new Pinia, the same profile. */
async function page() {
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useAuthStore } = await import('../src/stores/auth.js')
  const auth = useAuthStore()
  await flush()
  return {
    auth,
    outbox: async () => (await import('../src/composables/useOutbox.js')).useOutbox({ onSettled: () => {} }),
    draft: await import('../src/tasks/captureDraft.js'),
  }
}

/** Only these may survive a logout: UI preferences, the same for every account. */
const PREFERENCES = ['theme', 'ui', 'inboxMode']
const leftovers = () => [...profile.keys()].filter((k) => !PREFERENCES.includes(k)).sort()

beforeEach(() => {
  server.accounts.clear()
  server.tokens.clear()
  leave.mockClear()
  asked.length = 0
  answer = true
  account('alice', '1')
  account('bob', '2')
  fakeBrowser([['theme', 'dark'], ['ui', 'neu'], ['inboxMode', 'clarify']])
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** Alice signs in, captures "Kündigung" while offline and leaves half a draft. */
async function aliceWithUnsentWork() {
  const first = await page()
  await first.auth.login('alice', 'pw')
  await flush()
  const p = await page()
  const outbox = await p.outbox()
  outbox.add('capture', { description: 'Kündigung Arbeitsvertrag', label: 'Kündigung Arbeitsvertrag' })
  p.draft.saveDraft('Anwalt anrufen wegen')
  await flush()
  expect(outbox.ops.value.length).toBe(1)
  expect([...profile.values()].join('\n')).toContain('Kündigung Arbeitsvertrag')
  return p
}

describe('the role comes from /auth/me, never from storage (RISK-SEC-001)', () => {
  it('a role written into storage does not make the store an admin, not even before /me answers', async () => {
    fakeBrowser([['token', 'forged'], ['username', 'alice'], ['role', 'admin']])
    vi.resetModules()
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useAuthStore } = await import('../src/stores/auth.js')
    const auth = useAuthStore()
    expect(auth.role).toBe('user')
    await flush()
    expect(auth.role).toBe('user')
  })

  it('a valid session of a user stays a user although storage says admin', async () => {
    const p = await page()
    await p.auth.login('alice', 'pw')
    profile.set('role', 'admin')
    const again = await page()
    expect(again.auth.role).toBe('user')
  })

  it('an admin is an admin because /me says so', async () => {
    account('alice', '1', 'admin')
    const p = await page()
    await p.auth.login('alice', 'pw')
    const again = await page()
    expect(again.auth.role).toBe('admin')
  })
})

describe('an explicit logout (REV-006, decision D6)', () => {
  it('with an unsent queue asks first, and Abbrechen keeps everything', async () => {
    const p = await aliceWithUnsentWork()
    const before = new Map(profile)
    answer = false
    expect(p.auth.logout()).toBe(false)
    expect(asked.length).toBe(1)
    expect(asked[0]).toContain('1')
    expect(profile).toEqual(before)
    expect(leave).not.toHaveBeenCalled()
  })

  it('"abmelden und verwerfen" leaves no token, role, name, queue or draft in the profile', async () => {
    const p = await aliceWithUnsentWork()
    answer = true
    expect(p.auth.logout()).toBe(true)
    expect(asked.length).toBe(1)
    expect(leftovers()).toEqual([])
    expect([...profile.values()].join('\n')).not.toMatch(/Kündigung|Anwalt|alice|Alice|tok-/)
    // Leaves with a full page load, so the in-memory snapshot goes with the page.
    expect(leave).toHaveBeenCalledWith('/login')
  })

  it('keeps the UI preferences', async () => {
    const p = await aliceWithUnsentWork()
    p.auth.logout()
    expect(Object.fromEntries(profile)).toEqual({ theme: 'dark', ui: 'neu', inboxMode: 'clarify' })
  })

  it('with nothing unsent does not ask', async () => {
    const p = await page()
    await p.auth.login('alice', 'pw')
    expect(p.auth.logout()).toBe(true)
    expect(asked).toEqual([])
    expect(leftovers()).toEqual([])
  })
})

describe('a session that merely ends locks, it does not wipe', () => {
  /** What the API client does on a 401 for the session token. */
  const sessionEnds = () => profile.delete('token')

  it('the same account signing in again finds its queue and its draft', async () => {
    await aliceWithUnsentWork()
    sessionEnds()
    const login = await page()
    await login.auth.login('alice', 'pw')
    const p = await page()
    const outbox = await p.outbox()
    expect(outbox.ops.value.map((op) => op.label)).toEqual(['Kündigung Arbeitsvertrag'])
    expect(p.draft.readDraft()).toBe('Anwalt anrufen wegen')
  })

  it('another account signing in on the same profile sees none of it', async () => {
    await aliceWithUnsentWork()
    sessionEnds()
    const login = await page()
    await login.auth.login('bob', 'pw')
    const p = await page()
    const outbox = await p.outbox()
    expect(outbox.ops.value).toEqual([])
    expect(p.draft.readDraft()).toBe('')
  })

  it('a new account under the same username is another account and sees none of it', async () => {
    await aliceWithUnsentWork()
    sessionEnds()
    // Alice's account is deleted; someone registers "alice" again and gets a new id.
    account('alice', '7')
    const login = await page()
    await login.auth.login('alice', 'pw')
    const p = await page()
    const outbox = await p.outbox()
    expect(outbox.ops.value).toEqual([])
    expect(p.draft.readDraft()).toBe('')
  })
})

describe('the profile the previous deploy left behind', () => {
  const legacyQueue = JSON.stringify({
    v: 1,
    ops: [
      { id: 'a1', kind: 'capture', method: 'POST', path: '/inbox', body: { description: 'Alices Zettel' }, state: 'queued', user: 'alice', at: 1, label: 'Alices Zettel' },
      { id: 'b1', kind: 'capture', method: 'POST', path: '/inbox', body: { description: 'Bobs Zettel' }, state: 'queued', user: 'bob', at: 2, label: 'Bobs Zettel' },
    ],
  })

  beforeEach(() => {
    fakeBrowser([
      ['theme', 'dark'],
      ['token', 'legacy-token'],
      ['username', 'alice'],
      ['role', 'admin'],
      ['fullName', 'Alice Example'],
      ['email', 'a@example.com'],
      ['outbox', legacyQueue],
      ['captureDraft', JSON.stringify({ user: 'alice', tab: 'old', text: 'alter Entwurf' })],
    ])
    server.tokens.set('legacy-token', { username: 'alice', account: server.accounts.get('alice') })
  })

  it("moves the signed-in user's unsent ops and draft into her namespace, and nothing of anyone else's", async () => {
    const p = await page()
    const outbox = await p.outbox()
    await flush()
    expect(outbox.ops.value.map((op) => op.label)).toEqual(['Alices Zettel'])
    expect(p.draft.readDraft()).toBe('alter Entwurf')
    expect(profile.has('role')).toBe(false)
    expect(profile.has('fullName')).toBe(false)
    expect(profile.has('email')).toBe(false)
    expect(profile.get('outbox')).toContain('Bobs Zettel')
    expect(profile.get('outbox')).not.toContain('Alices Zettel')
  })

  it("the next explicit logout removes every legacy key, another user's leftovers included", async () => {
    const p = await page()
    await p.outbox()
    await flush()
    answer = true
    expect(p.auth.logout()).toBe(true)
    // Alice's own op and Bob's legacy op were both unsent: the question counts them.
    expect(asked.length).toBe(1)
    expect(asked[0]).toContain('2')
    expect(Object.fromEntries(profile)).toEqual({ theme: 'dark' })
  })
})
