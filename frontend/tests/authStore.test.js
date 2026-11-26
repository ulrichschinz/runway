import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// loaded before the fakes below replace `document`, as the real page loads it
import 'vue'

// What an explicit logout leaves in a shared browser profile (REV-006, RISK-SEC-001; brief 0075,
// ADR 0050). A synthetic profile — a Map behind a fake `localStorage` — and a fake API stand in for
// the browser and the server, so the real auth store, the real outbox and the real capture draft run
// together in node. Nothing is rendered (ADR 0007): the confirm dialog is `window.confirm`, stubbed.

/** The fake server: who holds which token, and each username's current account. */
const server = { accounts: new Map(), tokens: new Map(), seq: 0 }
function account(username, accountId, role = 'user', createdAt = '2026-01-01T00:00:00Z') {
  server.accounts.set(username, { account_id: accountId, role, created_at: createdAt })
}
/** Whether GET /auth/me answers (false: a network blip, a 5xx, an offline phone). */
const meAnswers = { on: true }
/** While `hold` is on, each GET /auth/me answer waits in `held` until a test releases it (a slow network). */
const meHeld = { hold: false, held: [] }

/** The synthetic profile. */
let profile
const httpError = (status) => Object.assign(new Error(String(status)), { response: { status } })

vi.mock('../src/api/client.js', () => ({
  default: {
    post: vi.fn(async (url, body) => {
      if (url !== '/auth/login') throw httpError(404)
      const token = `tok-${body.username}-${++server.seq}`
      const acct = server.accounts.get(body.username)
      server.tokens.set(token, { username: body.username, account: acct })
      return { data: { access_token: token, token_type: 'bearer', account_id: acct.account_id } }
    }),
    get: vi.fn(async (url) => {
      if (url !== '/auth/me') return { data: [] }
      if (!meAnswers.on) throw new Error('Network Error')
      // The real interceptor sends the stored token.
      const session = server.tokens.get(profile.get('token'))
      if (!session) throw httpError(401)
      const { account_id, role, created_at } = session.account
      const answer = { data: { username: session.username, role, full_name: 'Alice Example', email: 'a@example.com', account_id, created_at } }
      if (!meHeld.hold) return answer
      return new Promise((resolve) => meHeld.held.push(() => resolve(answer)))
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
const reload = vi.fn()
/** What the page registered on `window`, so a test can fire another tab's `storage` event. */
let listeners
let answer = true
const asked = []

function fakeBrowser(entries = [], { refuse = () => false } = {}) {
  profile = new Map(entries)
  listeners = []
  vi.stubGlobal('localStorage', {
    getItem: (k) => (profile.has(k) ? profile.get(k) : null),
    setItem: (k, v) => {
      if (refuse(k)) throw new DOMException('full', 'QuotaExceededError')
      profile.set(k, String(v))
    },
    removeItem: (k) => profile.delete(k),
    key: (i) => [...profile.keys()][i] ?? null,
    get length() {
      return profile.size
    },
  })
  vi.stubGlobal('window', {
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener: () => {},
    dispatchEvent: () => true,
    confirm: (text) => {
      asked.push(text)
      return answer
    },
    location: { assign: leave, reload, pathname: '/inbox', search: '', hash: '', href: '/inbox' },
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
  reload.mockClear()
  meAnswers.on = true
  meHeld.hold = false
  meHeld.held.length = 0
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

// Review of brief 0075 (round 2): the window in which no account id is bound, the in-memory
// queue, the username-matched migration, and the other tabs.
describe('an account id that /auth/me never delivered', () => {
  it('a re-login whose /auth/me fails still binds the account, and the logout asks and purges', async () => {
    await aliceWithUnsentWork()
    profile.delete('token') // a 401 locked the session
    const login = await page()
    meAnswers.on = false
    await login.auth.login('alice', 'pw')
    await flush()
    answer = true
    expect(login.auth.logout()).toBe(true)
    expect(asked.length).toBe(1)
    expect(leftovers()).toEqual([])
    expect([...profile.values()].join('\n')).not.toMatch(/Kündigung|Anwalt/)
  })

  it('the first load after the deploy while offline keeps a new capture in the profile, and the logout asks', async () => {
    // The previous deploy's session: a token, a username, no account id; /auth/me unreachable.
    fakeBrowser([['token', 'legacy-token'], ['username', 'alice']])
    server.tokens.set('legacy-token', { username: 'alice', account: server.accounts.get('alice') })
    meAnswers.on = false
    const p = await page()
    const outbox = await p.outbox()
    outbox.add('capture', { description: 'Geheime Notiz', label: 'Geheime Notiz' })
    await flush()
    // A reload or a closed tab must not lose it.
    expect([...profile.values()].join('\n')).toContain('Geheime Notiz')
    answer = false
    expect(p.auth.logout()).toBe(false)
    expect(asked.length).toBe(1)
    // Once /auth/me answers, the capture is in Alice's namespace.
    meAnswers.on = true
    const later = await page()
    const again = await later.outbox()
    await flush()
    expect(again.ops.value.map((op) => op.label)).toEqual(['Geheime Notiz'])
    expect(profile.get('outbox:1')).toContain('Geheime Notiz')
  })

  it('an unsent change that only the page holds (storage refuses) is asked about, and Abbrechen keeps the session', async () => {
    const first = await page()
    await first.auth.login('alice', 'pw')
    // The quota is full for the queue: the outbox keeps it in memory only.
    const refusingQueue = new Map(profile)
    fakeBrowser([...refusingQueue], { refuse: (k) => k.startsWith('outbox') })
    const p = await page()
    const outbox = await p.outbox()
    outbox.add('capture', { description: 'Nur im Speicher', label: 'Nur im Speicher' })
    await flush()
    expect(outbox.ops.value.length).toBe(1)
    answer = false
    expect(p.auth.logout()).toBe(false)
    expect(asked.length).toBe(1)
    expect(asked[0]).toContain('1')
    expect(profile.get('token')).toBeTruthy()
    expect(leave).not.toHaveBeenCalled()
  })
})

describe('the legacy profile after a fresh login', () => {
  const legacyOp = (id, text, at) => ({ id, kind: 'capture', method: 'POST', path: '/inbox', body: { description: text }, state: 'queued', user: 'alice', at, label: text })

  it("a deleted account's unsent text is never adopted by a new account under the same username", async () => {
    fakeBrowser([
      ['username', 'alice'],
      ['outbox', JSON.stringify({ v: 1, ops: [legacyOp('a1', 'Alte Alice Geheimnis', Date.parse('2026-03-01T00:00:00Z'))] })],
      ['captureDraft', JSON.stringify({ user: 'alice', tab: 'old', text: 'alter Entwurf der alten Alice' })],
    ])
    // The old alice is gone; a new "alice" registered on 2026-06-01 with a new id.
    account('alice', '99', 'user', '2026-06-01T00:00:00Z')
    const login = await page()
    await login.auth.login('alice', 'pw')
    const p = await page()
    const outbox = await p.outbox()
    await flush()
    expect(outbox.ops.value).toEqual([])
    expect(p.draft.readDraft()).toBe('')
    const { default: client } = await import('../src/api/client.js')
    expect(JSON.stringify(client.request.mock.calls)).not.toContain('Alte Alice Geheimnis')
    // Provably another account's: removed, not kept for anyone.
    expect([...profile.values()].join('\n')).not.toMatch(/Alte Alice|alter Entwurf/)
  })

  it("the same account, locked before the deploy, gets its unsent op back after signing in again", async () => {
    fakeBrowser([
      ['username', 'alice'],
      ['outbox', JSON.stringify({ v: 1, ops: [legacyOp('a2', 'Vor dem Deploy erfasst', Date.parse('2026-11-01T00:00:00Z'))] })],
    ])
    const login = await page()
    await login.auth.login('alice', 'pw')
    const p = await page()
    const outbox = await p.outbox()
    await flush()
    expect(outbox.ops.value.map((op) => op.label)).toEqual(['Vor dem Deploy erfasst'])
  })

  it('after the shim expires, binding sweeps every legacy key, other users’ included', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2027-03-02T00:00:00Z'))
    try {
      fakeBrowser([
        ['token', 'legacy-token'],
        ['username', 'alice'],
        ['outbox', JSON.stringify({ v: 1, ops: [{ ...legacyOp('b9', 'Bobs Rest', 5), user: 'bob' }] })],
        ['captureDraft', JSON.stringify({ user: 'bob', tab: 'old', text: 'Bobs Entwurf' })],
        ['role', 'admin'],
      ])
      server.tokens.set('legacy-token', { username: 'alice', account: server.accounts.get('alice') })
      await page()
      await flush()
      for (const k of ['outbox', 'captureDraft', 'role', 'fullName', 'email']) expect(profile.has(k)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the other open tabs', () => {
  const storageEvent = (key) => {
    for (const l of listeners) if (l.type === 'storage') l.fn({ key })
  }

  it('a tab signed in without a full load still follows a logout in another tab', async () => {
    const p = await page() // the login page: no token yet
    await p.auth.login('alice', 'pw') // the old UI: router.push, no reload
    profile.delete('token') // another tab logged out
    storageEvent('token')
    expect(leave).toHaveBeenCalledWith('/login')
  })

  it("another tab signing in as another account reloads this tab instead of rebinding it", async () => {
    const first = await page()
    await first.auth.login('alice', 'pw')
    leave.mockClear()
    reload.mockClear()
    // Another tab: bob signs in on the same profile.
    profile.set('token', 'tok-bob-x')
    profile.set('accountId', '2')
    storageEvent('token')
    expect(reload.mock.calls.length + leave.mock.calls.length).toBeGreaterThan(0)
  })
})

// Review of brief 0075 (round 3): an /auth/me answer that arrives after its session was replaced
// or ended, and a page the browser restores from its back/forward cache after a logout.
describe('an /auth/me answer for a session that is no longer the current one', () => {
  it("a late answer for the previous account does not rebind another account's session to it", async () => {
    await aliceWithUnsentWork()
    expect(profile.get('outbox:1')).toContain('Kündigung')
    // Tab 1 loads; its /auth/me for alice is still on the way.
    meHeld.hold = true
    await page()
    expect(meHeld.held.length).toBe(1)
    const lateAliceAnswer = meHeld.held.shift()
    // Tab 2, same profile: bob signs in, his /auth/me answers at once.
    meHeld.hold = false
    const tab2 = await page()
    await tab2.auth.login('bob', 'pw')
    expect(profile.get('accountId')).toBe('2')
    lateAliceAnswer()
    await flush()
    expect(profile.get('accountId')).toBe('2')
    expect(profile.get('username')).toBe('bob')
    // Bob's next page, before his own /auth/me answers, shows nothing of alice's.
    meAnswers.on = false
    const bobPage = await page()
    const outbox = await bobPage.outbox()
    await flush()
    expect(outbox.ops.value).toEqual([])
  })

  it('a late answer after an explicit logout writes nothing of the account back into the profile', async () => {
    const first = await page()
    await first.auth.login('alice', 'pw')
    meHeld.hold = true
    const p = await page()
    const late = meHeld.held.shift()
    expect(p.auth.logout()).toBe(true)
    late()
    await flush()
    expect(leftovers()).toEqual([])
    expect(p.auth.username).toBe(null)
    expect(p.auth.fullName).toBe('')
  })

  it('binding refuses to replace the account a login bound for the current token', async () => {
    const { bindAccount } = await import('../src/shared/browserStorage.js')
    const first = await page()
    await first.auth.login('bob', 'pw')
    expect(bindAccount({ accountId: '1', username: 'alice' })).toBe(false)
    expect(profile.get('accountId')).toBe('2')
    expect(profile.get('username')).toBe('bob')
  })
})

describe('a page restored from the back/forward cache', () => {
  const pageshow = (persisted) => {
    for (const l of listeners) if (l.type === 'pageshow') l.fn({ persisted })
  }

  it('after an explicit logout does not show the signed-out account again', async () => {
    const p = await aliceWithUnsentWork()
    expect(p.auth.logout()).toBe(true)
    leave.mockClear()
    reload.mockClear()
    // Back button: the browser restores the page as it was, without running its code again.
    pageshow(true)
    expect(reload.mock.calls.length + leave.mock.calls.length).toBeGreaterThan(0)
  })

  it('after another tab signed in as someone else reloads', async () => {
    const first = await page()
    await first.auth.login('alice', 'pw')
    profile.set('token', 'tok-bob-x')
    profile.set('accountId', '2')
    pageshow(true)
    expect(reload.mock.calls.length + leave.mock.calls.length).toBeGreaterThan(0)
  })

  it('of the same, still signed-in session stays as it is', async () => {
    const first = await page()
    await first.auth.login('alice', 'pw')
    leave.mockClear()
    reload.mockClear()
    pageshow(true)
    pageshow(false)
    expect(reload).not.toHaveBeenCalled()
    expect(leave).not.toHaveBeenCalled()
  })
})
