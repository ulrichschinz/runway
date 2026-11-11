import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// loaded before the fakes below replace `document`, as the real page loads it
import 'vue'

// useOutbox is the write path's effects (brief 0049). These fakes stand in for the browser objects
// it touches and for the API client, so its behaviour with a storage that refuses writes (brief 0062:
// a private window or a full quota) can be tested in node without mounting anything.
const sent = []
vi.mock('../src/api/client.js', () => ({
  default: {
    request: vi.fn(async ({ method, url, data }) => {
      sent.push(`${method} ${url}`)
      return { data: url === '/inbox' ? { uuid: 'srv-1', description: data.description } : { uuid: url.split('/')[2], status: 'completed' } }
    }),
    get: vi.fn(async () => ({ data: [] })),
  },
}))
vi.mock('../src/api/keepalive.js', () => ({ sendKeepalive: vi.fn(async () => ({ ok: true, json: async () => null })) }))

function fakeBrowser({ refuseWrites, store = new Map([['token', 't'], ['username', 'uli']]) }) {
  const writes = []
  const browser = { store, writes, full: false }
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      // `full`: a quota that is used up takes only a write smaller than the one it holds.
      const tooBig = browser.full && String(v).length >= (store.get(k)?.length ?? 0)
      if (refuseWrites || tooBig) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      writes.push(k)
      store.set(k, String(v))
    },
    removeItem: (k) => store.delete(k),
  })
  vi.stubGlobal('window', { addEventListener: () => {} })
  vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' })
  return browser
}

let browser
const settled = []
async function start(options) {
  browser = fakeBrowser(options)
  const { useOutbox } = await import('../src/composables/useOutbox.js')
  return useOutbox({ onSettled: (op) => settled.push(op.kind) })
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  sent.length = 0
  settled.length = 0
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useOutbox with a storage that refuses writes (a private window, a full quota)', () => {
  it('sends a capture at once', async () => {
    const outbox = await start({ refuseWrites: true })
    outbox.add('capture', { description: 'Milch kaufen', label: 'Milch kaufen' })
    await flush()
    expect(sent).toEqual(['POST /inbox'])
    expect(settled).toEqual(['capture'])
    expect(outbox.ops.value).toEqual([])
  })

  it('sends a held done when its hold ends', async () => {
    const outbox = await start({ refuseWrites: true })
    outbox.hold('done', { uuid: 'u-1', label: 'Belege' })
    expect(outbox.ops.value.map((op) => op.state)).toEqual(['held'])
    await vi.advanceTimersByTimeAsync(6100)
    expect(sent).toEqual(['POST /tasks/u-1/done'])
    expect(outbox.ops.value).toEqual([])
  })

  it('still takes a held done back inside the hold', async () => {
    const outbox = await start({ refuseWrites: true })
    const op = outbox.hold('done', { uuid: 'u-2', label: 'Belege' })
    expect(outbox.undo(op)).toBe(true)
    await vi.advanceTimersByTimeAsync(6100)
    expect(sent).toEqual([])
  })
})

describe('useOutbox with a working storage', () => {
  it('writes the queue before the request leaves, and sends it', async () => {
    const outbox = await start({ refuseWrites: false })
    outbox.add('capture', { description: 'Milch kaufen', label: 'Milch kaufen' })
    expect(browser.writes).toContain('outbox')
    expect(JSON.parse(browser.store.get('outbox')).ops.length).toBe(1)
    await flush()
    expect(sent).toEqual(['POST /inbox'])
    expect(JSON.parse(browser.store.get('outbox')).ops).toEqual([])
  })
})

describe('useOutbox when storage fills up after it took writes (review of brief 0062)', () => {
  const stored = () => JSON.parse(browser.store.get('outbox')).ops
  const long = 'Notiz '.repeat(200)

  it('strikes a done the user took back from the queue storage still holds, so no start sends it', async () => {
    const outbox = await start({ refuseWrites: false })
    const x = outbox.hold('done', { uuid: 'u-x', label: 'Belege' })
    outbox.hold('done', { uuid: 'u-y', label: 'Angebot' })
    browser.full = true
    outbox.add('capture', { description: long, label: long })
    expect(outbox.undo(x)).toBe(true)
    expect(stored().map((op) => op.uuid)).not.toContain('u-x')

    vi.resetModules()
    const store = browser.store
    browser.full = false
    await start({ refuseWrites: false, store })
    await vi.advanceTimersByTimeAsync(10000)
    expect(sent).not.toContain('POST /tasks/u-x/done')
  })

  it('strikes a capture already posted, so the next start does not post it again', async () => {
    const outbox = await start({ refuseWrites: false })
    outbox.hold('done', { uuid: 'u-y', label: long })
    outbox.add('capture', { description: 'Milch kaufen', label: 'Milch kaufen' })
    browser.full = true
    await flush()
    expect(sent).toEqual(['POST /inbox'])
    expect(stored().some((op) => op.kind === 'capture')).toBe(false)

    vi.resetModules()
    const store = browser.store
    browser.full = false
    await start({ refuseWrites: false, store })
    await flush()
    expect(sent.filter((r) => r === 'POST /inbox')).toEqual(['POST /inbox'])
  })

  it('writes the whole queue again once storage takes it', async () => {
    const outbox = await start({ refuseWrites: false })
    outbox.hold('done', { uuid: 'u-x', label: 'Belege' })
    browser.full = true
    outbox.add('capture', { description: long, label: long })
    browser.full = false
    outbox.hold('done', { uuid: 'u-z', label: 'Paket' })
    expect(stored().map((op) => (op.kind === 'capture' ? 'capture' : op.uuid)).sort()).toEqual(['capture', 'u-x', 'u-z'])
  })
})
