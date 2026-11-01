import { describe, expect, it } from 'vitest'

import {
  CONTEXT_PRESET,
  NO_CONTEXT,
  chipCount,
  contextCounts,
  eyebrowCount,
  orderContexts,
  presentContexts,
} from '../src/shared/contexts.js'
import { nextSections } from '../src/shared/sections.js'

const tasks = [
  { uuid: '1', tags: ['next', '@anrufe'] },
  { uuid: '2', tags: ['next', '@anrufe'] },
  { uuid: '3', tags: ['next', '@anrufe', '@computer'] },
  { uuid: '4', tags: ['next'] },
  { uuid: '5', tags: ['next,@unterwegs,@buero'] },
  { uuid: '6', tags: ['waiting', '@home'] },
  { uuid: '7', tags: ['someday', 'next', '@anrufe'] },
]

describe('which chips exist', () => {
  it('are the contexts of the open todos, split from comma tags, each once', () => {
    expect(presentContexts(tasks).sort()).toEqual(['@anrufe', '@buero', '@computer', '@home', '@unterwegs'])
  })

  it('come in the shared preset order first, then the rest alphabetically', () => {
    expect(orderContexts(presentContexts(tasks))).toEqual(['@home', '@computer', '@anrufe', '@buero', '@unterwegs'])
  })

  it('use the preset shared with Android', () => {
    expect(CONTEXT_PRESET).toEqual(['@home', '@computer', '@work', '@business'])
  })
})

describe('the numbers', () => {
  const counts = contextCounts(tasks)

  it('count Nächste todos only (F4), strictly per context', () => {
    expect(counts).toEqual({ all: 5, none: 1, byContext: { '@anrufe': 3, '@computer': 1, '@unterwegs': 1, '@buero': 1 } })
  })

  it('a context named twice on one todo counts it once', () => {
    expect(contextCounts([{ tags: ['next', '@a', '@a,@b'] }]).byContext).toEqual({ '@a': 1, '@b': 1 })
  })

  it('the chip and the eyebrow show the same number for every chip', () => {
    for (const chip of [null, NO_CONTEXT, ...presentContexts(tasks)]) {
      expect(eyebrowCount(chip, counts)[1], String(chip)).toBe(String(chipCount(chip, counts)))
    }
  })

  it('the eyebrow names the todos the lenient filter adds, and they are the list\'s extra rows', () => {
    const sections = nextSections({ tasks, today: '2026-10-31' }, '@anrufe')
    const shown = [...sections.jetzt, ...sections.bald, ...sections.spaeter].length
    expect(eyebrowCount('@anrufe', counts)).toEqual(['@anrufe', '3', '+1 ohne Kontext'])
    expect(shown).toBe(chipCount('@anrufe', counts) + counts.none)
  })
})
