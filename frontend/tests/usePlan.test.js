import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// usePlan's lifetime across a change of project (brief 0060, review): the API client is a fake whose
// answers the test releases one by one, so a save can come back after the page has moved on.
const calls = []
vi.mock('../src/api/client.js', () => {
  const call = (method) => (url, body) => new Promise((resolve, reject) => calls.push({ method, url, body, resolve, reject }))
  return { default: { get: call('get'), put: call('put') } }
})
const { usePlan } = await import('../src/projects/usePlan.js')

const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick()
}
/** Answer the oldest open call to `url` (its method too). */
async function answer(method, url, outcome) {
  const i = calls.findIndex((c) => c.method === method && c.url === url)
  expect(i, `${method} ${url} was asked`).toBeGreaterThanOrEqual(0)
  const [c] = calls.splice(i, 1)
  if (outcome instanceof Error) c.reject(outcome)
  else c.resolve({ data: outcome })
  await flush()
}
const httpError = (status, detail) => Object.assign(new Error(String(status)), { response: { status, data: { detail } } })

let scope
let name
let onSaved
let plan
beforeEach(async () => {
  calls.length = 0
  name = ref('A')
  onSaved = vi.fn()
  scope = effectScope()
  plan = scope.run(() => usePlan(() => name.value, { onSaved }))
  await answer('get', '/projects/plans/A', { vision: 'Alt' })
})
afterEach(() => scope.stop())

/** Edit A's plan, press Speichern, and open B before A's PUT answers (B's plan comes back at once). */
async function saveThenSwitch() {
  plan.set('vision', 'Neu')
  const pending = plan.save()
  name.value = 'B'
  await flush()
  await answer('get', '/projects/plans/B', { vision: 'Bs Plan' })
  return { pending }
}

describe('usePlan across projects', () => {
  it('a save says "Gespeichert" and reads the overview again', async () => {
    plan.set('vision', 'Neu')
    const pending = plan.save()
    await answer('put', '/projects/plans/A', { vision: 'Neu' })
    expect(await pending).toBe(true)
    expect(plan.savedAt).toBeGreaterThan(0)
    expect(plan.dirty).toBe(false)
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('another project\'s plan does not say "Gespeichert"', async () => {
    plan.set('vision', 'Neu')
    const pending = plan.save()
    await answer('put', '/projects/plans/A', { vision: 'Neu' })
    await pending
    name.value = 'B'
    await flush()
    expect(plan.savedAt).toBe(0)
    await answer('get', '/projects/plans/B', {})
    expect(plan.savedAt).toBe(0)
  })

  it('a save that fails after the page moved on shows no error on the next plan', async () => {
    const { pending } = await saveThenSwitch()
    await answer('put', '/projects/plans/A', httpError(500, 'kaputt'))
    expect(await pending).toBe(false)
    expect(plan.error).toBe(null)
    expect(plan.draft.vision).toBe('Bs Plan')
  })

  it('a save that succeeds after the page moved on still reads the overview again, and leaves the next plan alone', async () => {
    const { pending } = await saveThenSwitch()
    await answer('put', '/projects/plans/A', { vision: 'Neu' })
    expect(await pending).toBe(false)
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(plan.saved.vision).toBe('Bs Plan')
    expect(plan.savedAt).toBe(0)
  })

  it('a failed save of the plan on screen keeps the draft and says why', async () => {
    plan.set('vision', 'Neu')
    const pending = plan.save()
    await answer('put', '/projects/plans/A', httpError(422, 'zu lang'))
    expect(await pending).toBe(false)
    expect(plan.error).toEqual({ key: 'plan.saveFailed', m: 'zu lang' })
    expect(plan.draft.vision).toBe('Neu')
    expect(onSaved).not.toHaveBeenCalled()
  })
})
