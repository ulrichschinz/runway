// Runs every case of the shared rule vectors against the web's rules. Android runs the
// same file against its port (plan §11), so a rule both clients rely on is decided once.

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { CONTEXT_PRESET, contextCounts, eyebrowCount, orderContexts } from '../src/shared/contexts.js'
import { dayOf, followUpDay, SERVER_TZ } from '../src/shared/dates.js'
import { dayProgress, lensCaption } from '../src/shared/dayProgress.js'
import {
  NeedsAnswer,
  applyPayload,
  clarifyPayload,
  contextPayload,
  inversePayload,
  listOf,
  listPayload,
  planPayload,
  projectNameError,
} from '../src/shared/gtdRules.js'
import { nextSections, plannedToday, ringOf } from '../src/shared/sections.js'

const vectors = JSON.parse(readFileSync(new URL('./vectors/gtd-rules.v1.json', import.meta.url), 'utf8'))

const uuids = (tasks) => tasks.map((t) => t.uuid)

/** Each function of the file, with the projection its entry in `functions` names. */
const RUN = {
  listOf,
  clarifyPayload,
  listPayload,
  contextPayload,
  inversePayload,
  applyPayload: (task, body) => {
    const after = applyPayload(task, body)
    return { tags: [...after.tags].sort(), project: after.project ?? null, scheduledDay: dayOf(after.scheduled) }
  },
  planPayload,
  ringOf,
  plannedToday,
  nextSections: (snapshot, ctx) => {
    const s = nextSections(snapshot, ctx)
    return {
      faellig: uuids(s.faellig),
      faelligAndere: uuids(s.faelligAndere),
      dueMerged: s.dueMerged,
      jetzt: uuids(s.jetzt),
      bald: uuids(s.bald),
      spaeter: uuids(s.spaeter),
    }
  },
  dayProgress,
  lensCaption,
  orderContexts,
  contextCounts,
  eyebrowCount,
  dayOf,
  followUpDay,
  projectNameError,
}

describe('the vectors file describes itself', () => {
  it('is version 1 for the server zone and the shared preset', () => {
    expect(vectors.version).toBe(1)
    expect(vectors.tz).toBe(SERVER_TZ)
    expect(vectors.contextPreset).toEqual(CONTEXT_PRESET)
    expect(vectors.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('documents exactly the functions its cases call, and the web runs each of them', () => {
    const called = new Set(vectors.cases.map((c) => c.fn))
    expect(Object.keys(vectors.functions).sort()).toEqual([...called].sort())
    expect(Object.keys(RUN).sort()).toEqual([...called].sort())
  })

  it('gives every case a unique id named after its function, and exactly one outcome', () => {
    const ids = vectors.cases.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of vectors.cases) {
      expect(c.id.startsWith(`${c.fn}/`), c.id).toBe(true)
      expect(Array.isArray(c.args), c.id).toBe(true)
      expect('expect' in c !== 'throws' in c, c.id).toBe(true)
    }
  })

  it('carries the cases the plan requires', () => {
    const ids = vectors.cases.map((c) => c.id)
    for (const required of [
      'listOf/f4-next-and-waiting',
      'listPayload/legacy-comma-tag-keeps-its-context',
      'inversePayload/legacy-list-move-restores-parts',
      'lensCaption/extra-is-never-plus',
      'nextSections/merged-fallig-heading',
      'dayProgress/f6-planned-at-hold-keeps-the-denominator',
      'dayOf/spring-dst-night-midnight',
      'dayOf/autumn-dst-night-midnight',
    ]) {
      expect(ids).toContain(required)
    }
  })
})

describe('every vector case', () => {
  it.each(vectors.cases.map((c) => [c.id, c]))('%s', (_id, c) => {
    const run = () => RUN[c.fn](...structuredClone(c.args))
    if ('throws' in c) {
      let caught
      try {
        run()
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(NeedsAnswer)
      expect(caught.what).toBe(c.throws)
    } else {
      expect(run()).toEqual(c.expect)
    }
  })
})
